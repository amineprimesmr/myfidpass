/**
 * Campaign event jobs:
 * - règles `event_*` dans `business.campaign_automation_json` (`eventType` = member_created)
 * - planification : événements transactionnels (first_scan, reward_unlocked) + batch (daily_at, once_at, inactive_days)
 * - boucle ~1 min : jobs dus → notif membre cible (pas le cooldown « anti-spam segment » ; retry si aucun canal)
 */

import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { mergeCampaignAutomationJson } from "./campaign-automation-cron.js";
import { deliverDashboardBroadcast } from "../routes/businesses/notifications.js";
import { normalizeEventTypeToken } from "../services/campaign-automation-ai.js";
import { businessHasCustomNotificationIcon } from "./notification-icon-gate.js";
import {
  memberCrossedRewardUnlocked,
  memberHasExactlyOneQualifyingScan,
} from "./member-campaign-segments.js";
import {
  getMerchantNotificationTimezone,
  getZonedCalendarParts,
  shouldRunDailyAtNow,
  shouldRunOnceAtNow,
} from "./merchant-notification-timezone.js";

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
 * Anciennement : jobs `member_created` (bienvenue) à l’inscription — retiré du produit.
 */
export function scheduleCampaignEventJobsForMember({ business, memberId }) {
  if (!business?.id || !memberId) return 0;
  return 0;
}

function baseRuleIdFromJobRuleId(ruleId) {
  const t = String(ruleId || "");
  const idx = t.indexOf("__daily_");
  if (idx > 0) return t.slice(0, idx);
  const idxOnce = t.indexOf("__once_");
  if (idxOnce > 0) return t.slice(0, idxOnce);
  const idxInactive = t.indexOf("__lv_");
  if (idxInactive > 0) return t.slice(0, idxInactive);
  return t;
}

function selectInactiveMemberIds(businessId, days) {
  const rows = db
    .prepare(
      `SELECT id, last_visit_at FROM members WHERE business_id = ? AND last_visit_at IS NOT NULL AND last_visit_at < datetime('now', ?)`,
    )
    .all(businessId, `-${days} days`);
  return rows;
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

/**
 * Déclencheurs transactionnels : première visite réelle, franchissement palier récompense.
 * @param {object} p
 * @param {object} p.business
 * @param {string} p.memberId
 * @param {('first_scan'|'reward_unlocked')[]} p.triggers
 * @param {number} [p.previousBalance]
 * @param {number} [p.newBalance]
 */
export function scheduleMemberCampaignEvents({ business, memberId, triggers, previousBalance, newBalance }) {
  if (!business?.id || !memberId) return 0;
  if (!businessHasCustomNotificationIcon(business)) return 0;

  const triggerSet = new Set(Array.isArray(triggers) ? triggers : [triggers].filter(Boolean));
  if (!triggerSet.size) return 0;

  const config = mergeCampaignAutomationJson(business.campaign_automation_json ?? "");
  let scheduled = 0;

  for (const [ruleId, rule] of Object.entries(config.rules || {})) {
    if (!ruleId.startsWith("event_")) continue;
    if (!rule?.enabled) continue;
    const eventType = ruleEventType(rule);
    if (!eventType || eventType === "member_created") continue;
    const message = safeTrim(rule.message, 200);
    if (!message) continue;

    let shouldSchedule = false;
    if (eventType === "first_scan" && triggerSet.has("first_scan")) {
      shouldSchedule = memberHasExactlyOneQualifyingScan(business.id, memberId);
    } else if (eventType === "reward_unlocked" && triggerSet.has("reward_unlocked")) {
      shouldSchedule = memberCrossedRewardUnlocked(business, previousBalance, newBalance);
    }
    if (!shouldSchedule) continue;

    scheduled += enqueueRuleForMembers({
      businessId: business.id,
      ruleId,
      title: safeTrim(rule.title, 80),
      message,
      eventType,
      delayMinutes: clampDelayMinutes(rule.delayMinutes ?? rule.delay_minutes),
      memberIds: [memberId],
    });
  }

  return scheduled;
}

function scheduleDerivedEventJobs({ business, now = new Date() }) {
  if (!businessHasCustomNotificationIcon(business)) return 0;
  const config = mergeCampaignAutomationJson(business?.campaign_automation_json ?? "");
  const rules = config?.rules ?? {};
  const tz = getMerchantNotificationTimezone();
  let scheduled = 0;

  for (const [ruleId, rule] of Object.entries(rules)) {
    if (!ruleId.startsWith("event_")) continue;
    if (!rule?.enabled) continue;
    const eventType = ruleEventType(rule);
    if (!eventType || eventType === "member_created") continue;
    if (eventType === "first_scan" || eventType === "reward_unlocked") continue;
    const message = safeTrim(rule.message, 200);
    if (!message) continue;
    const title = safeTrim(rule.title, 80);
    const delayMinutes = clampDelayMinutes(rule.delayMinutes ?? rule.delay_minutes);

    if (eventType.startsWith("once_at:")) {
      if (!shouldRunOnceAtNow(eventType, now, tz)) continue;
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
      if (!shouldRunDailyAtNow(eventType, now, tz)) continue;
      const { ymd } = getZonedCalendarParts(now, tz);
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

    const inactive = /^inactive_days:(\d{1,3})$/.exec(eventType);
    if (inactive) {
      const days = Math.max(1, Math.min(365, Number(inactive[1]) || 30));
      const memberRows = selectInactiveMemberIds(business.id, days);
      for (const row of memberRows) {
        const lvKey = row.last_visit_at ? String(row.last_visit_at).slice(0, 10).replace(/-/g, "") : "never";
        const effectiveRuleId = `${ruleId}__lv_${lvKey}`.slice(0, 180);
        scheduled += enqueueRuleForMembers({
          businessId: business.id,
          ruleId: effectiveRuleId,
          title,
          message,
          eventType,
          delayMinutes,
          memberIds: [row.id],
          now,
        });
      }
    }
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
      if (job.event_type === "member_created") {
        markJobSkipped(job.id, "Automatisation bienvenue retirée du produit");
        skipped++;
        continue;
      }

      const business = businessMap.get(job.business_id) ?? null;
      if (!business) {
        markJobSkipped(job.id, "Business introuvable");
        skipped++;
        continue;
      }

      const config = mergeCampaignAutomationJson(business.campaign_automation_json ?? "");
      const baseRuleId = baseRuleIdFromJobRuleId(job.event_rule_id);
      const rule = config?.rules?.[baseRuleId];
      if (!rule?.enabled) {
        markJobSkipped(job.id, "Règle désactivée");
        skipped++;
        continue;
      }
      if (!businessHasCustomNotificationIcon(business)) {
        markJobSkipped(job.id, "Icône de notification personnalisée requise");
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
