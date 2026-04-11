/**
 * Réclamations points « livraison » (ticket Uber Eats, Deliveroo, etc.) — anti-doublon, file d’approbation.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { deductPoints } from "./members.js";

const db = getDb();

/**
 * @param {string} businessId
 * @param {string} fingerprint
 * @returns {object|null}
 */
export function findBlockingClaimByFingerprint(businessId, fingerprint) {
  if (!businessId || !fingerprint) return null;
  return (
    db
      .prepare(
        `SELECT * FROM receipt_delivery_claims
         WHERE business_id = ? AND claim_fingerprint = ?
           AND status IN ('pending', 'approved')
         ORDER BY datetime(created_at) DESC LIMIT 1`,
      )
      .get(businessId, fingerprint) || null
  );
}

/**
 * Même image (hash fichier) récemment — anti re-upload.
 * @param {string} businessId
 * @param {string} fileHash * @param {number} withinDays
 */
export function findRecentClaimByFileHash(businessId, fileHash, withinDays = 14) {
  if (!businessId || !fileHash) return null;
  const d = Math.max(1, Math.min(90, Math.floor(Number(withinDays) || 14)));
  return (
    db
      .prepare(
        `SELECT * FROM receipt_delivery_claims
         WHERE business_id = ? AND file_hash_sha256 = ?
           AND datetime(created_at) >= datetime('now', ?)
         ORDER BY datetime(created_at) DESC LIMIT 1`,
      )
      .get(businessId, fileHash, `-${d} days`) || null
  );
}

/**
 * @param {string} businessId
 * @param {string} memberId
 */
export function countMemberDeliveryClaimsTodayUtc(businessId, memberId) {
  if (!businessId || !memberId) return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM receipt_delivery_claims
       WHERE business_id = ? AND member_id = ?
         AND strftime('%Y-%m-%d', created_at) = strftime('%Y-%m-%d', 'now')`,
    )
    .get(businessId, memberId);
  return Number(row?.n) || 0;
}

/**
 * @param {string} businessId
 * @param {string} memberId
 */
export function countMemberDeliveryClaimsThisMonthUtc(businessId, memberId) {
  if (!businessId || !memberId) return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM receipt_delivery_claims
       WHERE business_id = ? AND member_id = ?
         AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
    )
    .get(businessId, memberId);
  return Number(row?.n) || 0;
}

/**
 * @param {object} row
 */
export function insertReceiptDeliveryClaim(row) {
  const id = row.id || randomUUID();
  db.prepare(
    `INSERT INTO receipt_delivery_claims (
      id, business_id, member_id, status, file_hash_sha256, claim_fingerprint,
      amount_eur, points_credited, ai_extracted_json, ai_confidence, merchant_match_ok,
      rejection_reason, idempotency_key, created_at, resolved_at, resolution_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
  ).run(
    id,
    row.business_id,
    row.member_id,
    row.status || "pending",
    row.file_hash_sha256,
    row.claim_fingerprint,
    row.amount_eur,
    row.points_credited != null ? row.points_credited : null,
    row.ai_extracted_json != null ? String(row.ai_extracted_json) : null,
    row.ai_confidence != null ? Number(row.ai_confidence) : null,
    row.merchant_match_ok != null ? (row.merchant_match_ok ? 1 : 0) : null,
    row.rejection_reason != null ? String(row.rejection_reason) : null,
    row.idempotency_key || null,
    row.resolved_at || null,
    row.resolution_note || null,
  );
  return db.prepare("SELECT * FROM receipt_delivery_claims WHERE id = ?").get(id);
}

/**
 * @param {string} businessId
 * @param {string} memberId
 * @param {number} [limit]
 */
export function listReceiptDeliveryClaimsForMember(businessId, memberId, limit = 30) {
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 30)));
  return db
    .prepare(
      `SELECT id, status, amount_eur, points_credited, ai_confidence, merchant_match_ok,
              rejection_reason, created_at, resolved_at, resolution_note
       FROM receipt_delivery_claims
       WHERE business_id = ? AND member_id = ?
       ORDER BY datetime(created_at) DESC LIMIT ?`,
    )
    .all(businessId, memberId, lim);
}

/**
 * @param {string} businessId
 * @param {string} [status] pending | approved | rejected
 */
export function listReceiptDeliveryClaimsForDashboard(businessId, status = null, limit = 100) {
  const lim = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  const st = status ? String(status).trim().toLowerCase() : "";
  if (st === "pending" || st === "approved" || st === "rejected") {
    return db
      .prepare(
        `SELECT c.*, m.name AS member_name, m.email AS member_email
         FROM receipt_delivery_claims c
         JOIN members m ON m.id = c.member_id AND m.business_id = c.business_id
         WHERE c.business_id = ? AND c.status = ?
         ORDER BY datetime(c.created_at) DESC LIMIT ?`,
      )
      .all(businessId, st, lim);
  }
  return db
    .prepare(
      `SELECT c.*, m.name AS member_name, m.email AS member_email
       FROM receipt_delivery_claims c
       JOIN members m ON m.id = c.member_id AND m.business_id = c.business_id
       WHERE c.business_id = ?
       ORDER BY datetime(c.created_at) DESC LIMIT ?`,
    )
    .all(businessId, lim);
}

/**
 * @param {string} businessId
 * @param {string} claimId
 */
export function getReceiptDeliveryClaimForBusiness(businessId, claimId) {
  if (!businessId || !claimId) return null;
  return (
    db
      .prepare(
        `SELECT c.*, m.name AS member_name, m.email AS member_email
         FROM receipt_delivery_claims c
         JOIN members m ON m.id = c.member_id AND m.business_id = c.business_id
         WHERE c.business_id = ? AND c.id = ?`,
      )
      .get(businessId, claimId) || null
  );
}

/**
 * @param {string} claimId
 * @param {object} patch
 */
export function updateReceiptDeliveryClaim(claimId, patch) {
  const allowed = [
    "status",
    "points_credited",
    "rejection_reason",
    "resolved_at",
    "resolution_note",
  ];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(patch[key]);
    }
  }
  if (setClauses.length === 0) return null;
  values.push(claimId);
  db.prepare(`UPDATE receipt_delivery_claims SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  return db.prepare("SELECT * FROM receipt_delivery_claims WHERE id = ?").get(claimId) || null;
}

/**
 * Idempotence : même clé pour une réclamation déjà créée.
 * @param {string} businessId
 * @param {string} key
 */
export function getReceiptDeliveryClaimByIdempotencyKey(businessId, key) {
  if (!businessId || !key) return null;
  return (
    db
      .prepare(
        "SELECT * FROM receipt_delivery_claims WHERE business_id = ? AND idempotency_key = ? LIMIT 1",
      )
      .get(businessId, key) || null
  );
}

/**
 * Mode dev uniquement (contrôlé par la route) : supprime toutes les réclamations livraison du commerce,
 * supprime les transactions `points_add` liées, et retire aux membres les points/tampons crédités via ces réclamations approuvées.
 * @param {string} businessId
 * @returns {{ claims_deleted: number, transactions_deleted: number, members_adjusted: Array<{ member_id: string, points_deducted: number }> }}
 */
export function devResetAllReceiptDeliveryClaimsForBusiness(businessId) {
  if (!businessId) {
    return { claims_deleted: 0, transactions_deleted: 0, members_adjusted: [] };
  }
  const summarize = db
    .prepare(
      `SELECT member_id, SUM(COALESCE(points_credited, 0)) AS total
       FROM receipt_delivery_claims
       WHERE business_id = ? AND status = 'approved'
       GROUP BY member_id`,
    )
    .all(businessId);

  const run = db.transaction(() => {
    const delTxStmt = db.prepare(
      `DELETE FROM transactions
       WHERE business_id = ?
         AND type = 'points_add'
         AND json_valid(metadata) = 1
         AND json_extract(metadata, '$.source') = ?`,
    );
    const txResult = delTxStmt.run(businessId, "delivery_receipt_claim");
    const transactions_deleted = Number(txResult.changes) || 0;

    const claimsResult = db.prepare(`DELETE FROM receipt_delivery_claims WHERE business_id = ?`).run(businessId);
    const claims_deleted = Number(claimsResult.changes) || 0;

    /** @type {{ member_id: string, points_deducted: number }[]} */
    const members_adjusted = [];
    for (const row of summarize) {
      const mid = row.member_id;
      const total = Number(row.total) || 0;
      const toDeduct = Math.max(0, Math.floor(total));
      if (toDeduct > 0 && mid) {
        deductPoints(mid, toDeduct);
        members_adjusted.push({ member_id: String(mid), points_deducted: toDeduct });
      }
    }
    return { claims_deleted, transactions_deleted, members_adjusted };
  });

  return run();
}
