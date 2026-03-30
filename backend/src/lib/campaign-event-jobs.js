/**
 * Campaign event jobs:
 * - règles `event_*` dans `business.campaign_automation_json`
 * - planification à l’enregistrement PassKit (carte dans Apple Wallet), pas à la création membre seule
 * - boucle ~1 min : jobs dus → notif membre cible (cooldown + retry si aucun canal)
 */

import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { filterMemberIdsExcludingRecentNotifications } from "../db/webpush.js";
import { mergeCampaignAutomationJson } from "./campaign-automation-cron.js";
import { deliverDashboardBroadcast } from "../routes/businesses/notifications.js";

const db = getDb();

function clampDelayMinutes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.max(1, Math.min(1440, Math.floor(v)));
}

/** JSON iOS (camelCase) ou web (snake_case). */
function ruleEventType(rule) {
  if (!rule || typeof rule !== "object") return "";
  const t = rule.eventType ?? rule.event_type;
  return t != null ? String(t).trim() : "";
}

function safeTrim(s, maxLen) {
  if (s == null) return "";
  return String(s).trim().slice(0, maxLen);
}

function getApiBase() {
  return (process.env.PUBLIC_API_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
}

/**
 * Planifie les jobs d’évènement pour un membre.
 * Déclenché à l’enregistrement PassKit (carte ajoutée dans Apple Wallet) — aligné produit « Carte ajoutée ».
 * Règles : `event_*` avec `eventType` / `event_type` = `member_created` (nom historique API, = carte prête côté client).
 */
export function scheduleCampaignEventJobsForMember({ business, memberId }) {
  if (!business?.id || !memberId) return 0;

  const config = mergeCampaignAutomationJson(business.campaign_automation_json ?? "");
  const rules = config?.rules ?? {};

  const now = new Date();
  const globalCooldownDays = config?.global_cooldown_days ?? 7;

  let scheduled = 0;
  for (const [ruleId, rule] of Object.entries(rules)) {
    if (!ruleId.startsWith("event_")) continue;
    if (!rule?.enabled) continue;
    if (ruleEventType(rule) !== "member_created") continue;

    const delayMinutes = clampDelayMinutes(rule.delayMinutes ?? rule.delay_minutes);
    const message = safeTrim(rule.message, 200);
    if (!message) continue;

    const title = safeTrim(rule.title, 80);
    const runAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();

    const jobId = randomUUID();
    const res = db
      .prepare(
        `INSERT OR IGNORE INTO campaign_event_jobs 
          (id, business_id, member_id, event_rule_id, event_type, run_at, title, message, status, attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0)`
      )
      .run(jobId, business.id, memberId, ruleId, "member_created", runAt, title || null, message);

    // SQLite `changes` ≠ nb insert (OR IGNORE), donc on fait simple:
    // si le row est ignoré, l’insert ne s’applique pas et `changes` vaut 0.
    scheduled += (res?.changes ?? 0) > 0 ? 1 : 0;
  }

  // Note: on ne stocke pas le cooldown dans le job. On applique le cooldown au moment du send.
  void globalCooldownDays;
  return scheduled;
}

async function claimDueJobs({ nowIso, limit }) {
  const rows = db
    .prepare(
      `SELECT id, business_id, member_id, event_rule_id, event_type, run_at, title, message, attempts
       FROM campaign_event_jobs
       WHERE status = 'queued' AND run_at <= ?
       ORDER BY run_at ASC
       LIMIT ?`
    )
    .all(nowIso, limit);

  const claimed = [];
  const processingAt = new Date().toISOString();
  for (const r of rows) {
    const updated = db
      .prepare(
        `UPDATE campaign_event_jobs
         SET status = 'processing', processing_at = ?, attempts = attempts + 1
         WHERE id = ? AND status = 'queued'`
      )
      .run(processingAt, r.id);

    if ((updated?.changes ?? 0) > 0) claimed.push(r);
  }
  return claimed;
}

function markJobSent(jobId) {
  db.prepare("UPDATE campaign_event_jobs SET status = 'sent', processed_at = ? WHERE id = ?").run(new Date().toISOString(), jobId);
}

function markJobSkipped(jobId, reason) {
  db
    .prepare("UPDATE campaign_event_jobs SET status = 'skipped', processed_at = ?, last_error = ? WHERE id = ?")
    .run(new Date().toISOString(), safeTrim(reason, 500), jobId);
}

function markJobFailed(jobId, reason) {
  db
    .prepare("UPDATE campaign_event_jobs SET status = 'failed', processed_at = ?, last_error = ? WHERE id = ?")
    .run(new Date().toISOString(), safeTrim(reason, 2000), jobId);
}

/** Aucun Wallet/Web : remettre en file après délai (le token PassKit peut arriver avec retard). */
function requeueJobForLater(jobId, delayMinutes, reason) {
  const runAt = new Date(Date.now() + Math.max(1, delayMinutes) * 60_000).toISOString();
  db
    .prepare(
      `UPDATE campaign_event_jobs
       SET status = 'queued', run_at = ?, processing_at = NULL, last_error = ?
       WHERE id = ?`
    )
    .run(runAt, safeTrim(reason, 500), jobId);
}

/**
 * Exécute les jobs event dus (loop scheduler).
 */
export async function runCampaignEventJobsCron({ limit = 50 } = {}) {
  const nowIso = new Date().toISOString();
  const dueJobs = await claimDueJobs({ nowIso, limit });
  if (dueJobs.length === 0) return { ran: 0, sent: 0, skipped: 0, failed: 0, requeued: 0 };

  const apiBase = getApiBase();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let requeued = 0;

  for (const job of dueJobs) {
    try {
      const business = getBusinessById(job.business_id);
      if (!business) {
        markJobSkipped(job.id, "Business introuvable");
        skipped++;
        continue;
      }

      // Vérifie la règle au moment du send (si elle a été désactivée côté web).
      const config = mergeCampaignAutomationJson(business.campaign_automation_json ?? "");
      const rule = config?.rules?.[job.event_rule_id];
      if (!rule?.enabled) {
        markJobSkipped(job.id, "Règle désactivée");
        skipped++;
        continue;
      }

      const cooldownDays = config?.global_cooldown_days ?? 7;
      const memberIdsAllowed = filterMemberIdsExcludingRecentNotifications(business.id, [job.member_id], cooldownDays);
      if (memberIdsAllowed.length === 0) {
        markJobSkipped(job.id, "Cooldown atteint");
        skipped++;
        continue;
      }

      const triggerName = `campaign_event_${job.event_rule_id}`.slice(0, 96);
      const title = safeTrim(job.title, 80) || null;
      const message = safeTrim(job.message, 200);

      const delivery = await deliverDashboardBroadcast(
        business,
        business.slug,
        apiBase,
        [job.member_id],
        title,
        message,
        "passkit",
        {
          triggerName,
          sendMerchantReceipt: false,
          touchMemberLastVisit: false,
        }
      );

      const delivered = Number(delivery?.sent) || 0;
      const attemptsAfterClaim = (Number(job.attempts) || 0) + 1;

      if (delivered === 0) {
        if (attemptsAfterClaim >= 24) {
          markJobSkipped(
            job.id,
            "Aucun canal Wallet/Web pour ce membre après plusieurs tentatives (vérifier l’ajout de la carte ou Web Push)."
          );
          skipped++;
        } else {
          requeueJobForLater(job.id, 5, "En attente d’un canal push (Wallet/Web)");
          requeued++;
        }
        continue;
      }

      markJobSent(job.id);
      sent++;
    } catch (e) {
      markJobFailed(job.id, e?.message || String(e));
      failed++;
    }
  }

  return { ran: dueJobs.length, sent, skipped, failed, requeued };
}

