/**
 * Repository web_push_subscriptions et notification_log. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

export function saveWebPushSubscription({ businessId, memberId, endpoint, p256dh, auth }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO web_push_subscriptions (id, business_id, member_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, businessId, memberId, endpoint, p256dh, auth, now);
  return id;
}

export function getWebPushSubscriptionsByBusiness(businessId) {
  return db.prepare(
    "SELECT id, member_id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE business_id = ?"
  ).all(businessId);
}

export function getWebPushSubscriptionsByMemberIds(businessId, memberIds) {
  if (!memberIds?.length) return [];
  const placeholders = memberIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT id, member_id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE business_id = ? AND member_id IN (${placeholders})`
  ).all(businessId, ...memberIds);
}

/**
 * @param {object} p
 * @param {string} p.businessId
 * @param {string|null} [p.memberId]
 * @param {string|null} [p.title]
 * @param {string} p.body
 * @param {string} [p.type]
 * @param {string|null} [p.batchId]
 * @param {string|null} [p.channel] — web_push | passkit | merchant_app
 * @param {string|null} [p.triggerName] — campaign_manual, campaign_auto, pass_sync, merchant_receipt, …
 * @param {number} [p.countsForMemberCooldown] — 1 = compte pour le cooldown anti-spam auto
 * @param {string} [p.status] — sent | failed | skipped
 * @param {string|null} [p.errorDetail]
 */
export function logNotification({
  businessId,
  memberId,
  title,
  body,
  type = "web_push",
  batchId = null,
  channel = null,
  triggerName = null,
  countsForMemberCooldown = 1,
  status = "sent",
  errorDetail = null,
}) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const hasExtended = db.prepare("PRAGMA table_info(notification_log)").all().some((c) => c.name === "batch_id");
  if (!hasExtended) {
    db.prepare(
      `INSERT INTO notification_log (id, business_id, member_id, title, body, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, businessId, memberId || null, title || null, body, type, now);
    return id;
  }
  db.prepare(
    `INSERT INTO notification_log (
      id, business_id, member_id, title, body, type, created_at,
      batch_id, channel, trigger_name, counts_for_member_cooldown, status, error_detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    businessId,
    memberId || null,
    title || null,
    body,
    type,
    now,
    batchId,
    channel,
    triggerName,
    countsForMemberCooldown ? 1 : 0,
    status,
    errorDetail
  );
  return id;
}

/** Crée un lot d’envoi pour traçabilité (dashboard / audit). */
export function createNotificationBatch({ businessId, triggerName, summary = {} }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_batches'").get();
  if (!hasTable) return id;
  db.prepare(
    `INSERT INTO notification_batches (id, business_id, trigger_name, created_at, summary_json) VALUES (?, ?, ?, ?, ?)`
  ).run(id, businessId, triggerName, now, JSON.stringify(summary));
  return id;
}

export function updateNotificationBatchSummary(batchId, summary) {
  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_batches'").get();
  if (!hasTable || !batchId) return;
  db.prepare("UPDATE notification_batches SET summary_json = ? WHERE id = ?").run(JSON.stringify(summary), batchId);
}

/** Historique récent des lots pour un commerce (dashboard). */
export function getNotificationBatchesForBusiness(businessId, { limit = 20 } = {}) {
  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_batches'").get();
  if (!hasTable) return [];
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  return db
    .prepare(
      `SELECT id, business_id, trigger_name, created_at, summary_json FROM notification_batches WHERE business_id = ? ORDER BY created_at DESC LIMIT ${lim}`
    )
    .all(businessId);
}

/** Lignes de journal récentes (optionnel, pour debug / SaaS). */
export function getNotificationLogRecentForBusiness(businessId, { limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  return db
    .prepare(
      `SELECT id, member_id, title, body, type, created_at, batch_id, channel, trigger_name, status
       FROM notification_log WHERE business_id = ? ORDER BY created_at DESC LIMIT ${lim}`
    )
    .all(businessId);
}

/** Supprime une subscription expirée ou invalide (réponse HTTP 410 / 404 du push service). */
export function deleteWebPushSubscriptionByEndpoint(endpoint) {
  db.prepare("DELETE FROM web_push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function getWebPushSubscriptionsByBusinessFiltered(businessId, memberIds = null) {
  let rows = db.prepare(
    "SELECT id, member_id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE business_id = ?"
  ).all(businessId);
  if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const set = new Set(memberIds);
    rows = rows.filter((r) => set.has(r.member_id));
  }
  return rows;
}

/**
 * Exclut les membres ayant déjà reçu une notification **marketing** (cooldown) dans les N derniers jours.
 */
export function filterMemberIdsExcludingRecentNotifications(businessId, memberIds, cooldownDays) {
  if (!memberIds?.length) return [];
  const safe = Math.min(90, Math.max(1, Math.floor(Number(cooldownDays) || 7)));
  const placeholders = memberIds.map(() => "?").join(",");
  const hasCooldownCol = db.prepare("PRAGMA table_info(notification_log)").all().some((c) => c.name === "counts_for_member_cooldown");
  const sql = hasCooldownCol
    ? `SELECT DISTINCT member_id FROM notification_log WHERE business_id = ? AND member_id IN (${placeholders}) AND created_at >= datetime('now', '-${safe} days') AND counts_for_member_cooldown = 1`
    : `SELECT DISTINCT member_id FROM notification_log WHERE business_id = ? AND member_id IN (${placeholders}) AND created_at >= datetime('now', '-${safe} days')`;
  const recent = db.prepare(sql).all(businessId, ...memberIds);
  const recentSet = new Set(recent.map((r) => r.member_id));
  return memberIds.filter((id) => !recentSet.has(id));
}
