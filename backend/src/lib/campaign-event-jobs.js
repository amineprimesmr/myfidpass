/**
 * Campaign event jobs:
 * - règles `event_*` dans `business.campaign_automation_json` (`eventType` = member_created)
 * - planification : création membre (API) + enregistrement PassKit (INSERT OR IGNORE évite les doublons)
 * - boucle ~1 min : jobs dus → notif membre cible (pas le cooldown « anti-spam segment » ; retry si aucun canal)
 */

import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { mergeCampaignAutomationJson } from "./campaign-automation-cron.js";
import { deliverDashboardBroadcast } from "../routes/businesses/notifications.js";
import { normalizeEventTypeToken } from "../services/campaign-automation-ai.js";

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
  return normalizeEventTypeToken(t) || "";
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
 * Appelé à la création membre (dashboard / import) et à l’enregistrement PassKit.
 * Règles : `event_*` avec `eventType` / `event_type` = `member_created`.
 */
export function scheduleCampaignEventJobsForMember({ business, memberId }) {
  if (!business?.id || !memberId) return 0;

  const config = mergeCampaignAutomationJson(business.campaign_automation_json ?? "");
  const rules = config?.rules ?? {};

  const now = new Date();

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

  return scheduled;
}

function baseRuleIdFromJobRuleId(ruleId) {
  const t = String(ruleId || "");
  const idx = t.indexOf("__daily_");
  return idx > 0 ? t.slice(0, idx) : t;
}

function selectMemberIdsForRule(businessId, eventType) {
  const t = String(eventType || "");
  if (t === "first_scan") {
    const rows = db
      .prepare(
        `SELECT DISTINCT m.id
         FROM members m
         JOIN transactions tr ON tr.member_id = m.id AND tr.business_id = m.business_id
         WHERE m.business_id = ?`
      )
      .all(businessId);
    return rows.map((r) => r.id);
  }
  if (t === "reward_unlocked") {
    const rows = db.prepare("SELECT id FROM members WHERE business_id = ? AND points >= 50").all(businessId);
    return rows.map((r) => r.id);
  }
  const inactive = /^inactive_days:(\d{1,3})$/.exec(t);
  if (inactive) {
    const days = Math.max(1, Math.min(365, Number(inactive[1]) || 30));
    const rows = db
      .prepare(`SELECT id FROM members WHERE business_id = ? AND (last_visit_at IS NULL OR last_visit_at < datetime('now', ?))`)
      .all(businessId, `-${days} days`);
    return rows.map((r) => r.id);
  }
  return [];
}

function shouldRunDailyNow(eventType, now = new Date()) {
  const m = /^daily_at:(\d{2}):(\d{2})$/.exec(String(eventType || ""));
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return now.getUTCHours() === hh && now.getUTCMinutes() === mm;
}

function shouldRunOnceNow(eventType, now = new Date()) {
  const m = /^once_at:(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2})$/.exec(String(eventType || ""));
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  return (
    now.getUTCFullYear() === y &&
    now.getUTCMonth() + 1 === mo &&
    now.getUTCDate() === d &&
    now.getUTCHours() === hh &&
    now.getUTCMinutes() === mm
  );
}

function enqueueRuleForMembers({ businessId, ruleId, title, message, eventType, delayMinutes, memberIds, now = new Date() }) {
  let scheduled = 0;
  for (const memberId of memberIds) {
    const runAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();
    const jobId = randomUUID();
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO campaign_event_jobs
          (id, business_id, member_id, event_rule_id, event_type, run_at, title, message, status, attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0)`
      )
      .run(jobId, businessId, memberId, ruleId, eventType, runAt, title || null, message);
    scheduled += (result?.changes ?? 0) > 0 ? 1 : 0;
  }
  return scheduled;
}

function scheduleDerivedEventJobs({ business, now = new Date() }) {
  const config = mergeCampaignAutomationJson(business?.campaign_automation_json ?? "");
  const rules = config?.rules ?? {};
  let scheduled = 0;
  for (const [ruleId, rule] of Object.entries(rules)) {
    if (!ruleId.startsWith("event_")) continue;
    if (!rule?.enabled) continue;
    const eventType = ruleEventType(rule);
    if (!eventType || eventType === "member_created") continue;
    const message = safeTrim(rule.message, 200);
    if (!message) continue;
    const title = safeTrim(rule.title, 80);
    const delayMinutes = clampDelayMinutes(rule.delayMinutes ?? rule.delay_minutes);

    if (eventType.startsWith("once_at:")) {
      if (!shouldRunOnceNow(eventType, now)) continue;
      const slot = String(eventType).replace(/^once_at:/i, "").replace(/[^0-9T-]/g, "");
      const effectiveRuleId = `${ruleId}__once_${slot}`.slice(0, 180);
      const memberRows = db.prepare("SELECT id FROM members WHERE business_id = ?").all(business.id);
      const memberIds = memberRows.map((r) => r.id);
      scheduled += enqueueRuleForMembers({
        businessId: business.id,
        ruleId: effectiveRuleId,
        title,
        message,
        eventType,
        delayMinutes,
        memberIds,
        now,
      });
      continue;
    }

    if (eventType.startsWith("daily_at:")) {
      if (!shouldRunDailyNow(eventType, now)) continue;
      const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
      const effectiveRuleId = `${ruleId}__daily_${ymd}`;
      const memberRows = db.prepare("SELECT id FROM members WHERE business_id = ?").all(business.id);
      const memberIds = memberRows.map((r) => r.id);
      scheduled += enqueueRuleForMembers({
        businessId: business.id,
        ruleId: effectiveRuleId,
        title,
        message,
        eventType,
        delayMinutes,
        memberIds,
        now,
      });
      continue;
    }

    const memberIds = selectMemberIdsForRule(business.id, eventType);
    if (!memberIds.length) continue;
    scheduled += enqueueRuleForMembers({
      businessId: business.id,
      ruleId,
      title,
      message,
      eventType,
      delayMinutes,
      memberIds,
      now,
    });
  }
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
  const allBusinesses = db.prepare("SELECT id, campaign_automation_json FROM businesses").all();
  for (const b of allBusinesses) {
    try {
      scheduleDerivedEventJobs({ business: b });
    } catch {
      // no-op: on garde le cron robuste
    }
  }

  const nowIso = new Date().toISOString();
  const dueJobs = await claimDueJobs({ nowIso, limit });
  if (dueJobs.length === 0) return { ran: 0, sent: 0, skipped: 0, failed: 0, requeued: 0 };

  const apiBase = getApiBase();

  // Batch-fetch de tous les businesses nécessaires en une seule requête (évite N+1).
  const businessIds = [...new Set(dueJobs.map((j) => j.business_id).filter(Boolean))];
  const businessRows = businessIds.length > 0
    ? db.prepare(`SELECT * FROM businesses WHERE id IN (${businessIds.map(() => "?").join(",")})`)
        .all(...businessIds)
    : [];
  const businessMap = new Map(businessRows.map((b) => [b.id, b]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let requeued = 0;

  for (const job of dueJobs) {
    try {
      const business = businessMap.get(job.business_id) ?? null;
      if (!business) {
        markJobSkipped(job.id, "Business introuvable");
        skipped++;
        continue;
      }

      // Vérifie la règle au moment du send (si elle a été désactivée côté web).
      const config = mergeCampaignAutomationJson(business.campaign_automation_json ?? "");
      const baseRuleId = baseRuleIdFromJobRuleId(job.event_rule_id);
      const rule = config?.rules?.[baseRuleId];
      if (!rule?.enabled) {
        markJobSkipped(job.id, "Règle désactivée");
        skipped++;
        continue;
      }

      // Ne pas appliquer le « délai min entre notifs » (global_cooldown_days) ici : il sert aux campagnes
      // segmentées (cron 24 h). Une notif manuelle de test comptait pour le cooldown et bloquait toutes
      // les automatisations événementielles pour ce client pendant des jours. La contrainte UNIQUE sur
      // (business_id, member_id, event_rule_id) suffit pour n’envoyer qu’une fois par règle.

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

