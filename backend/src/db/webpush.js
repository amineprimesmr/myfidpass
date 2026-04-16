/**
 * Repository web_push_subscriptions et notification_log. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

/** Aligné sur `passes.js` — exclure les enregistrements de test du dédoublonnage. */
const PASSKIT_TEST_DEVICE_ID = "test-device-123";

/**
 * Membres qui ont un pass Wallet actif (token APNs) : ils ne doivent pas recevoir AUSSI un Web Push
 * pour la même campagne (sinon double bannière : une PWA/Safari + une Wallet, souvent avec deux icônes).
 */
function sqlExcludeMembersWithPassKit(alias = "w") {
  return `NOT EXISTS (
    SELECT 1 FROM pass_registrations pr
    INNER JOIN members m ON m.id = pr.serial_number
    WHERE m.business_id = ${alias}.business_id
      AND pr.serial_number = ${alias}.member_id
      AND pr.push_token IS NOT NULL AND TRIM(pr.push_token) != ''
      AND pr.device_library_identifier != '${PASSKIT_TEST_DEVICE_ID}'
  )`;
}

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

/**
 * Abonnements Web Push hors membres ayant déjà Apple Wallet (PassKit actif).
 * Évite la double notification (Web Push + Wallet) quand la comparaison JS member_id/serial_number échouait.
 */
export function getWebPushSubscriptionsByBusinessExcludingPassKitOwners(businessId) {
  const sql = `
    SELECT w.id, w.member_id, w.endpoint, w.p256dh, w.auth
    FROM web_push_subscriptions w
    WHERE w.business_id = ?
      AND ${sqlExcludeMembersWithPassKit("w")}
  `;
  return db.prepare(sql).all(businessId);
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
 * Comme {@link getWebPushSubscriptionsByBusinessFiltered}, mais sans les membres qui ont déjà PassKit.
 */
export function getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners(businessId, memberIds = null) {
  if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const placeholders = memberIds.map(() => "?").join(",");
    const sql = `
      SELECT w.id, w.member_id, w.endpoint, w.p256dh, w.auth
      FROM web_push_subscriptions w
      WHERE w.business_id = ?
        AND w.member_id IN (${placeholders})
        AND ${sqlExcludeMembersWithPassKit("w")}
    `;
    return db.prepare(sql).all(businessId, ...memberIds);
  }
  return getWebPushSubscriptionsByBusinessExcludingPassKitOwners(businessId);
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

/**
 * Exclut les membres ayant déjà reçu une notif avec ce `trigger_name` sur l’année civile courante (SQLite `strftime`).
 * Utilisé pour l’automatisation anniversaire (hors cooldown marketing global).
 */
export function filterMemberIdsExcludingTriggerThisCalendarYear(businessId, memberIds, triggerName) {
  if (!memberIds?.length) return [];
  const tn = String(triggerName || "").trim();
  if (!tn) return memberIds;
  const cols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  if (!cols.includes("trigger_name")) return memberIds;
  const placeholders = memberIds.map(() => "?").join(",");
  const sql = `SELECT DISTINCT member_id FROM notification_log WHERE business_id = ? AND trigger_name = ? AND strftime('%Y', created_at) = strftime('%Y', 'now') AND member_id IN (${placeholders})`;
  const sent = db.prepare(sql).all(businessId, tn, ...memberIds);
  const sentSet = new Set(sent.map((r) => r.member_id));
  return memberIds.filter((id) => !sentSet.has(id));
}
