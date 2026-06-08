/**
 * Repository web_push_subscriptions et notification_log. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { sqlExcludeTechnicalMembers } from "./member-segment-sql.js";

const REAL_MEMBERS_SQL = sqlExcludeTechnicalMembers("m.email");

const db = getDb();

let notificationLogExtendedCache = null;

function notificationLogHasExtendedColumns() {
  if (notificationLogExtendedCache !== null) return notificationLogExtendedCache;
  try {
    notificationLogExtendedCache = db
      .prepare("PRAGMA table_info(notification_log)")
      .all()
      .some((c) => c.name === "batch_id");
  } catch {
    notificationLogExtendedCache = false;
  }
  return notificationLogExtendedCache;
}

/** Aligné sur `passes.js` — exclure les enregistrements de test du dédoublonnage. */
const PASSKIT_TEST_DEVICE_ID = "test-device-123";

/**
 * Membres qui ont un pass Wallet actif (token APNs) : ils ne doivent pas recevoir AUSSI un Web Push
 * pour la même campagne (sinon double bannière : une PWA/Safari + une Wallet, souvent avec deux icônes).
 */
function sqlExcludeMembersWithPassKit(alias = "w") {
  /* Comparaison normalisée : évite Web Push + Wallet pour le même membre si UUID diffère
   * par casse / espaces (données historiques ou clients hors chemin standard). */
  return `NOT EXISTS (
    SELECT 1 FROM pass_registrations pr
    INNER JOIN members m ON LOWER(TRIM(m.id)) = LOWER(TRIM(pr.serial_number))
    WHERE m.business_id = ${alias}.business_id
      AND LOWER(TRIM(CAST(pr.serial_number AS TEXT))) = LOWER(TRIM(CAST(${alias}.member_id AS TEXT)))
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
  const hasExtended = notificationLogHasExtendedColumns();
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
/** Le membre a déjà reçu au moins une notification campagne (évite le verso Wallet « Message » sur nouvelle carte). */
export function memberHasDeliveredCampaignNotification(businessId, memberId) {
  if (!businessId || !memberId) return false;
  const cols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  if (!cols.includes("status")) {
    const row = db
      .prepare(
        `SELECT 1 FROM notification_log WHERE business_id = ? AND member_id = ? LIMIT 1`,
      )
      .get(businessId, memberId);
    return !!row;
  }
  const row = db
    .prepare(
      `SELECT 1 FROM notification_log WHERE business_id = ? AND member_id = ? AND status = 'sent' LIMIT 1`,
    )
    .get(businessId, memberId);
  return !!row;
}

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

/**
 * Dernières campagnes push + comptage des retours en magasin (1ʳᵉ transaction `points_add` dans les 48 h suivant l’envoi).
 * @param {string} businessId
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{ batch_id: string; trigger_name: string; created_at: string; sent_total: number | null; recipients_distinct: number; returned_within_48h: number }>}
 */
function batchMonthKey(createdAt) {
  if (!createdAt || typeof createdAt !== "string") return null;
  const trimmed = createdAt.trim();
  if (trimmed.length >= 7) return trimmed.slice(0, 7);
  return null;
}

export function getNotificationCampaignInsightsForBusiness(businessId, { limit = 12, monthKey = null } = {}) {
  const batches = getNotificationBatchesForBusiness(businessId, { limit });
  const out = [];
  for (const b of batches) {
    if (monthKey && batchMonthKey(b.created_at) !== monthKey) continue;
    let summary = {};
    try {
      summary = JSON.parse(b.summary_json || "{}");
    } catch {
      summary = {};
    }
    let notificationTitle = null;
    let message = null;
    try {
      const sample = db
        .prepare(
          `SELECT title, body FROM notification_log
           WHERE business_id = ? AND batch_id = ? AND status = 'sent'
             AND IFNULL(type,'') != 'merchant_receipt'
           ORDER BY created_at ASC LIMIT 1`,
        )
        .get(businessId, b.id);
      if (sample) {
        const t = String(sample.title || "").trim();
        const body = String(sample.body || "").trim();
        if (t) notificationTitle = t;
        if (body) message = body;
      }
    } catch (_e) {
      /* */
    }
    const recipientsRow = db
      .prepare(
        `SELECT COUNT(DISTINCT nl.member_id) AS n FROM notification_log nl
         INNER JOIN members m ON m.id = nl.member_id AND m.business_id = nl.business_id
         WHERE nl.business_id = ? AND nl.batch_id = ? AND nl.status = 'sent'
           AND nl.member_id IS NOT NULL
           AND IFNULL(nl.type,'') != 'merchant_receipt'
           AND ${REAL_MEMBERS_SQL}`,
      )
      .get(businessId, b.id);
    const recipients = recipientsRow?.n ?? 0;
    let returnedWithin48h = 0;
    try {
      const rev = db
        .prepare(
          `SELECT COUNT(DISTINCT t.member_id) AS n
           FROM transactions t
           WHERE t.business_id = ? AND t.type = 'points_add'
             AND datetime(t.created_at) > datetime(?)
             AND datetime(t.created_at) <= datetime(?, '+48 hours')
             AND EXISTS (
               SELECT 1 FROM notification_log nl
               WHERE nl.business_id = ? AND nl.batch_id = ?
                 AND nl.member_id = t.member_id AND nl.status = 'sent'
                 AND IFNULL(nl.type,'') != 'merchant_receipt'
             )`,
        )
        .get(businessId, b.created_at, b.created_at, businessId, b.id);
      returnedWithin48h = rev?.n ?? 0;
    } catch (_e) {
      returnedWithin48h = 0;
    }
    const sentTotal = summary.sent;
    out.push({
      batch_id: b.id,
      trigger_name: b.trigger_name,
      created_at: b.created_at,
      sent_total: typeof sentTotal === "number" ? sentTotal : null,
      recipients_distinct: recipients,
      returned_within_48h: returnedWithin48h,
      notification_title: notificationTitle,
      message,
    });
  }
  return out;
}
