/**
 * Défis OTP SMS (connexion / inscription téléphone).
 */
import { getDb } from "./connection.js";

const db = getDb();

export function upsertPhoneOtpChallenge(phoneE164, codeHash, expiresAtIso, lastSentAtIso) {
  db.prepare(
    `INSERT INTO phone_otp_challenges (phone_e164, code_hash, expires_at, attempts, last_sent_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(phone_e164) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       last_sent_at = excluded.last_sent_at`,
  ).run(phoneE164, codeHash, expiresAtIso, lastSentAtIso);
}

export function getPhoneOtpChallenge(phoneE164) {
  return db.prepare("SELECT * FROM phone_otp_challenges WHERE phone_e164 = ?").get(phoneE164) || null;
}

export function deletePhoneOtpChallenge(phoneE164) {
  db.prepare("DELETE FROM phone_otp_challenges WHERE phone_e164 = ?").run(phoneE164);
}

export function incrementPhoneOtpAttempts(phoneE164) {
  const info = db.prepare("UPDATE phone_otp_challenges SET attempts = attempts + 1 WHERE phone_e164 = ?").run(phoneE164);
  return info.changes > 0;
}
