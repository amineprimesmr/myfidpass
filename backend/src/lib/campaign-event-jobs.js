/**
 * Campaign event jobs:
 * - les règles event_... sont stockées dans `business.campaign_automation_json`
 * - à la création d’un membre, on planifie des jobs `run_at = now + delay`
 * - un loop backend récupère les jobs dus et envoie une notif au membre unique
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

function safeTrim(s, maxLen) {
  if (s == null) return "";
  return String(s).trim().slice(0, maxLen);
}

function getApiBase() {
  return (process.env.PUBLIC_API_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
}

/**
 * Planifie les jobs d’évènement pour un membre fraîchement créé.
 * Ne planifie que `eventType=member_created` (v1).
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
    if (rule.eventType !== "member_created") continue;

    const delayMinutes = clampDelayMinutes(rule.delayMinutes);
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

/**
 * Exécute les jobs event dus (loop scheduler).
 */
export async function runCampaignEventJobsCron({ limit = 50 } = {}) {
  const nowIso = new Date().toISOString();
  const dueJobs = await claimDueJobs({ nowIso, limit });
  if (dueJobs.length === 0) return { ran: 0, sent: 0, skipped: 0, failed: 0 };

  const apiBase = getApiBase();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

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

      await deliverDashboardBroadcast(
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

      markJobSent(job.id);
      sent++;
    } catch (e) {
      markJobFailed(job.id, e?.message || String(e));
      failed++;
    }
  }

  return { ran: dueJobs.length, sent, skipped, failed };
}

