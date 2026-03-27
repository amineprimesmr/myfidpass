/**
 * Repository transactions. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

export function createTransaction({ id, businessId, memberId, type, points, metadata, idempotencyKey }) {
  const tid = id || randomUUID();
  db.prepare(
    `INSERT INTO transactions (id, business_id, member_id, type, points, metadata, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(tid, businessId, memberId, type, points, metadata ? JSON.stringify(metadata) : null, idempotencyKey || null);
  return db.prepare("SELECT * FROM transactions WHERE id = ?").get(tid);
}

/**
 * Vérifie si une transaction existe déjà pour cette clé d'idempotence.
 * Retourne la transaction existante ou null.
 */
export function getTransactionByIdempotencyKey(businessId, idempotencyKey) {
  if (!businessId || !idempotencyKey) return null;
  return db.prepare(
    "SELECT * FROM transactions WHERE business_id = ? AND idempotency_key = ? LIMIT 1"
  ).get(businessId, idempotencyKey) || null;
}

export function getTransactionsForBusiness(businessId, { limit = 30, offset = 0, memberId = null, days = null, type = null } = {}) {
  let where = "t.business_id = ?";
  const params = [businessId];
  if (memberId) {
    where += " AND t.member_id = ?";
    params.push(memberId);
  }
  if (days === 7 || days === 30 || days === 90) {
    where += ` AND t.created_at >= datetime('now', '-${days} days')`;
  }
  if (type === "visit") {
    where += " AND t.type = 'points_add' AND (t.metadata LIKE '%\"visit\":true%' OR t.metadata LIKE '%\"visit\": true%')";
  } else if (type === "points_add") {
    where += " AND t.type = 'points_add'";
  }
  const stmt = db.prepare(
    `SELECT t.id, t.member_id, t.type, t.points, t.metadata, t.created_at, m.name as member_name, m.email as member_email
     FROM transactions t JOIN members m ON t.member_id = m.id
     WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) as n FROM transactions t WHERE ${where}`);
  const countParams = params.slice();
  params.push(limit, offset);
  const rows = stmt.all(...params);
  const total = countStmt.get(...countParams)?.n ?? 0;
  return { transactions: rows, total };
}
