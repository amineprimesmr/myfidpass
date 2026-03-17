/**
 * Repository engagement_proofs (preuve avis / follow). Référence : REFONTE-REGLES.md.
 */
import { getDb } from "./connection.js";

const db = getDb();

export function createEngagementProof({
  id,
  businessId,
  memberId,
  actionType,
  nonce,
  tokenHash,
  expiresAt,
  startIpHash = null,
  startDeviceHash = null,
}) {
  db.prepare(
    `INSERT INTO engagement_proofs
     (id, business_id, member_id, action_type, nonce, token_hash, status, start_ip_hash, start_device_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?, datetime('now'))`
  ).run(id, businessId, memberId, actionType, nonce, tokenHash, startIpHash, startDeviceHash, expiresAt);
  return db.prepare("SELECT * FROM engagement_proofs WHERE id = ?").get(id);
}

export function getEngagementProofById(proofId) {
  return db.prepare("SELECT * FROM engagement_proofs WHERE id = ?").get(proofId) || null;
}

export function getEngagementProofByTokenHash(tokenHash) {
  return db.prepare("SELECT * FROM engagement_proofs WHERE token_hash = ?").get(tokenHash) || null;
}

export function markEngagementProofReturned(proofId, returnIpHash = null) {
  db.prepare(
    `UPDATE engagement_proofs
     SET status = CASE WHEN status = 'started' THEN 'returned' ELSE status END,
         returned_at = COALESCE(returned_at, datetime('now')),
         return_ip_hash = COALESCE(return_ip_hash, ?)
     WHERE id = ?`
  ).run(returnIpHash, proofId);
  return getEngagementProofById(proofId);
}

export function incrementEngagementProofAttempts(proofId) {
  db.prepare("UPDATE engagement_proofs SET attempt_count = attempt_count + 1 WHERE id = ?").run(proofId);
  return getEngagementProofById(proofId);
}

export function finalizeEngagementProof({
  proofId,
  status,
  score = 0,
  reasons = [],
  completionId = null,
  claimIpHash = null,
  claimDeviceHash = null,
}) {
  db.prepare(
    `UPDATE engagement_proofs
     SET status = ?, score = ?, reasons = ?, completion_id = ?, claim_ip_hash = ?, claim_device_hash = ?, claimed_at = datetime('now')
     WHERE id = ?`
  ).run(
    status,
    Number(score) || 0,
    Array.isArray(reasons) ? JSON.stringify(reasons) : null,
    completionId,
    claimIpHash,
    claimDeviceHash,
    proofId
  );
  return getEngagementProofById(proofId);
}

export function countRecentEngagementProofStarts({ businessId, memberId, actionType, sinceMinutes = 5 }) {
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM engagement_proofs
     WHERE business_id = ? AND member_id = ? AND action_type = ?
       AND created_at >= datetime('now', '-' || ? || ' minutes')`
  ).get(businessId, memberId, actionType, Math.max(1, Number(sinceMinutes) || 5));
  return row?.n ?? 0;
}
