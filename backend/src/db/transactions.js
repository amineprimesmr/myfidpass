/**
 * Repository transactions. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { scheduleMerchantDashboardSyncForBusiness } from "../lib/merchant-dashboard-sync-push.js";

const db = getDb();

export function createTransaction({ id, businessId, memberId, type, points, metadata, idempotencyKey, actorUserId }) {
  const tid = id || randomUUID();
  const aid = actorUserId && String(actorUserId).trim() ? String(actorUserId).trim() : null;
  db.prepare(
    `INSERT INTO transactions (id, business_id, member_id, type, points, metadata, idempotency_key, actor_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    tid,
    businessId,
    memberId,
    type,
    points,
    metadata ? JSON.stringify(metadata) : null,
    idempotencyKey || null,
    aid,
  );
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(tid);
  scheduleMerchantDashboardSyncForBusiness(businessId, "transaction");
  return row;
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

/**
 * Compte les crédits `points_add` pour un membre sur la journée civile UTC (alignée sur `strftime` SQLite).
 * Sert aux plafonds « passages par jour » (anti-fraude caisse).
 */
export function countMemberPointsAddsTodayUtc(businessId, memberId) {
  if (!businessId || !memberId) return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM transactions
       WHERE business_id = ? AND member_id = ? AND type = 'points_add'
         AND strftime('%Y-%m-%d', created_at) = strftime('%Y-%m-%d', 'now')`
    )
    .get(businessId, memberId);
  return Number(row?.n) || 0;
}

/** Types SQL autorisés pour le filtre `type` ou `types` (hors pseudo `visit`). */
const FILTERABLE_TYPES = new Set([
  "points_add",
  "reward_redeem",
  "points_correction",
  "points_redeem_game_tickets",
]);

/**
 * Liste paginée + filtres (dashboard + exports).
 * - `days` : 7, 30, 90, 365 — ignoré si `fromDate` ou `toDate` est fourni.
 * - `fromDate` / `toDate` : `YYYY-MM-DD` (inclus, selon date SQLite sur `created_at`).
 * - `types` : chaîne CSV (ex. `points_add,reward_redeem`) + éventuellement `visit` — prioritaire sur `type` legacy.
 */
export function getTransactionsForBusiness(
  businessId,
  {
    limit = 30,
    offset = 0,
    memberId = null,
    days = null,
    fromDate = null,
    toDate = null,
    type = null,
    typesCsv = null,
  } = {}
) {
  let where = "t.business_id = ?";
  const params = [businessId];
  if (memberId) {
    where += " AND t.member_id = ?";
    params.push(memberId);
  }

  const fromOk = typeof fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromDate.trim());
  const toOk = typeof toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(toDate.trim());
  if (fromOk) {
    where += " AND date(t.created_at) >= date(?)";
    params.push(fromDate.trim());
  }
  if (toOk) {
    where += " AND date(t.created_at) <= date(?)";
    params.push(toDate.trim());
  }
  if (!fromOk && !toOk) {
    const d = Number(days);
    if (d === 7 || d === 30 || d === 90 || d === 365) {
      where += ` AND t.created_at >= datetime('now', '-${d} days')`;
    }
  }

  const csv = typesCsv != null ? String(typesCsv).trim() : "";
  if (csv) {
    const parts = csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ors = [];
    for (const p of parts) {
      if (p === "visit") {
        ors.push(
          "(t.type = 'points_add' AND (t.metadata LIKE '%\"visit\":true%' OR t.metadata LIKE '%\"visit\": true%'))"
        );
      } else if (FILTERABLE_TYPES.has(p)) {
        ors.push("t.type = ?");
        params.push(p);
      }
    }
    if (ors.length) where += ` AND (${ors.join(" OR ")})`;
  } else if (type === "visit") {
    where +=
      " AND t.type = 'points_add' AND (t.metadata LIKE '%\"visit\":true%' OR t.metadata LIKE '%\"visit\": true%')";
  } else if (type === "points_add") {
    where += " AND t.type = 'points_add'";
  } else if (type && FILTERABLE_TYPES.has(String(type))) {
    where += " AND t.type = ?";
    params.push(String(type));
  }

  const stmt = db.prepare(
    `SELECT t.id, t.member_id, t.type, t.points, t.metadata, t.created_at, m.name as member_name, m.email as member_email
     FROM transactions t JOIN members m ON t.member_id = m.id
     WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) as n FROM transactions t JOIN members m ON t.member_id = m.id WHERE ${where}`);
  const countParams = params.slice();
  params.push(limit, offset);
  const rows = stmt.all(...params);
  const total = countStmt.get(...countParams)?.n ?? 0;
  return { transactions: rows, total };
}
