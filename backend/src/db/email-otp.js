/**
 * Défis OTP e-mail (connexion / inscription commerçant).
 */
import { getDb } from "./connection.js";

const db = getDb();

export function upsertEmailOtpChallenge(emailNorm, codeHash, expiresAtIso, lastSentAtIso) {
  db.prepare(
    `INSERT INTO email_otp_challenges (email_norm, code_hash, expires_at, attempts, last_sent_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email_norm) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       last_sent_at = excluded.last_sent_at`,
  ).run(emailNorm, codeHash, expiresAtIso, lastSentAtIso);
}

export function getEmailOtpChallenge(emailNorm) {
  return db.prepare("SELECT * FROM email_otp_challenges WHERE email_norm = ?").get(emailNorm) || null;
}

export function deleteEmailOtpChallenge(emailNorm) {
  db.prepare("DELETE FROM email_otp_challenges WHERE email_norm = ?").run(emailNorm);
}

export function incrementEmailOtpAttempts(emailNorm) {
  const info = db.prepare("UPDATE email_otp_challenges SET attempts = attempts + 1 WHERE email_norm = ?").run(emailNorm);
  return info.changes > 0;
}
