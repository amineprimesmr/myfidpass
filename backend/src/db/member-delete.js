/**
 * Suppression membre(s) et données liées (pass, transactions, jeux, engagement).
 * Ordre compatible clés étrangères (reward_grants → spin, etc.).
 */
import { getDb } from "./connection.js";
import { getMemberForBusiness } from "./members.js";

function placeholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

/**
 * Supprime les lignes dépendantes puis le(s) membre(s). Utiliser dans une transaction.
 * @param {object} db — instance better-sqlite3
 * @param {string} businessId
 * @param {string[]} memberIds
 */
export function deleteMembersCascadeInTx(db, businessId, memberIds) {
  if (!memberIds.length) return;
  const ph = placeholders(memberIds.length);
  const args = memberIds;

  try {
    db.prepare(`DELETE FROM reward_grants WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM game_spins WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM ticket_ledger WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM member_ticket_wallets WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM member_category_assignments WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM engagement_proofs WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM engagement_completions WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM notification_log WHERE member_id IN (${ph})`).run(...args);
  } catch (_) {}
  try {
    db.prepare(`DELETE FROM pass_registrations WHERE serial_number IN (${ph})`).run(...args);
  } catch (_) {}

  db.prepare(`DELETE FROM transactions WHERE business_id = ? AND member_id IN (${ph})`).run(businessId, ...args);
  db.prepare(`DELETE FROM web_push_subscriptions WHERE business_id = ? AND member_id IN (${ph})`).run(businessId, ...args);

  db.prepare(`DELETE FROM members WHERE business_id = ? AND id IN (${ph})`).run(businessId, ...args);
}

/**
 * @returns {{ ok: true } | { ok: false, reason: "not_found" }}
 */
export function deleteMemberForBusiness(businessId, memberId) {
  const m = getMemberForBusiness(memberId, businessId);
  if (!m) return { ok: false, reason: "not_found" };
  const db = getDb();
  const tx = db.transaction(() => {
    deleteMembersCascadeInTx(db, businessId, [memberId]);
  });
  tx();
  return { ok: true };
}

/**
 * Supprime tous les membres du commerce (cartes, historiques, inscriptions Wallet/Web Push liées).
 * @returns {{ deleted: number }}
 */
export function deleteAllMembersForBusiness(businessId) {
  const db = getDb();
  const rows = db.prepare("SELECT id FROM members WHERE business_id = ?").all(businessId);
  const memberIds = rows.map((r) => r.id);
  if (!memberIds.length) return { deleted: 0 };

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM transactions WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM web_push_subscriptions WHERE business_id = ?").run(businessId);
    deleteMembersCascadeInTx(db, businessId, memberIds);
  });
  tx();
  return { deleted: memberIds.length };
}
