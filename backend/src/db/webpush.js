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

export function logNotification({ businessId, memberId, title, body, type = "web_push" }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notification_log (id, business_id, member_id, title, body, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, businessId, memberId || null, title || null, body, type, now);
  return id;
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
 * Exclut les membres ayant déjà reçu une notification (tous types) dans les N derniers jours.
 * Utilisé par les campagnes automatiques pour limiter le spam.
 */
export function filterMemberIdsExcludingRecentNotifications(businessId, memberIds, cooldownDays) {
  if (!memberIds?.length) return [];
  const safe = Math.min(90, Math.max(1, Math.floor(Number(cooldownDays) || 7)));
  const placeholders = memberIds.map(() => "?").join(",");
  const sql = `SELECT DISTINCT member_id FROM notification_log WHERE business_id = ? AND member_id IN (${placeholders}) AND created_at >= datetime('now', '-${safe} days')`;
  const recent = db.prepare(sql).all(businessId, ...memberIds);
  const recentSet = new Set(recent.map((r) => r.member_id));
  return memberIds.filter((id) => !recentSet.has(id));
}
