/**
 * Système de parrainage commerçant-à-commerçant.
 * Codes uniques, relations parrain/filleul, réductions gagnées.
 */
import { randomUUID, randomBytes } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

/** Alphabet lisible sans ambiguïté (pas de 0/O, 1/I/L). */
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genCode(len = 8) {
  const buf = randomBytes(len);
  return Array.from(buf, (b) => ALPHA[b % ALPHA.length]).join("");
}

/** Retourne (ou crée) le code de parrainage unique de l'utilisateur. */
export function getOrCreateReferralCode(userId) {
  if (!userId) return null;
  const row = db.prepare("SELECT code FROM merchant_referral_codes WHERE user_id = ?").get(userId);
  if (row) return row.code;

  let code;
  let tries = 0;
  do {
    if (++tries > 30) throw new Error("referral_code_generation_failed");
    code = genCode();
  } while (db.prepare("SELECT 1 FROM merchant_referral_codes WHERE code = ?").get(code));

  db.prepare("INSERT INTO merchant_referral_codes (user_id, code) VALUES (?, ?)").run(userId, code);
  return code;
}

/** Retourne l'user_id du parrain qui possède ce code, ou null. */
export function getUserIdByReferralCode(code) {
  if (!code) return null;
  const row = db
    .prepare("SELECT user_id FROM merchant_referral_codes WHERE code = ?")
    .get(String(code).trim().toUpperCase());
  return row?.user_id ?? null;
}

/**
 * Enregistre un parrainage (parrain → filleul).
 * Idempotent : ne fait rien si le filleul est déjà parrainé.
 */
export function recordReferral(referrerUserId, referredUserId) {
  if (!referrerUserId || !referredUserId) return null;
  if (referrerUserId === referredUserId) return null;

  const existing = db
    .prepare("SELECT id FROM merchant_referrals WHERE referred_user_id = ?")
    .get(referredUserId);
  if (existing) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO merchant_referrals (id, referrer_user_id, referred_user_id, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`
    ).run(id, referrerUserId, referredUserId, now);
    return { id, referrerUserId, referredUserId, status: "pending" };
  } catch (_) {
    return null;
  }
}

/**
 * Convertit le parrainage d'un filleul (déclenché quand son abonnement devient actif).
 * Crée les réductions pour le parrain (2 mois -50 %) et le filleul (1 mois -50 %).
 */
export function convertReferralForUser(referredUserId) {
  if (!referredUserId) return null;
  const referral = db
    .prepare(
      "SELECT * FROM merchant_referrals WHERE referred_user_id = ? AND status = 'pending'",
    )
    .get(referredUserId);
  if (!referral) return null;

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE merchant_referrals SET status = 'converted', converted_at = ? WHERE id = ?",
  ).run(now, referral.id);

  db.prepare(
    `INSERT OR IGNORE INTO merchant_referral_discounts
     (id, user_id, referral_id, discount_type, discount_pct, months_total, months_used, status, created_at)
     VALUES (?, ?, ?, 'parrain_50pct', 50, 2, 0, 'active', ?)`,
  ).run(randomUUID(), referral.referrer_user_id, referral.id, now);

  db.prepare(
    `INSERT OR IGNORE INTO merchant_referral_discounts
     (id, user_id, referral_id, discount_type, discount_pct, months_total, months_used, status, created_at)
     VALUES (?, ?, ?, 'parraine_50pct', 50, 1, 0, 'active', ?)`,
  ).run(randomUUID(), referredUserId, referral.id, now);

  return referral;
}

/** Statistiques de parrainage pour un utilisateur. */
export function getReferralInfo(userId) {
  if (!userId) return { total: 0, converted: 0, discounts: [] };
  const total =
    db
      .prepare("SELECT COUNT(*) as c FROM merchant_referrals WHERE referrer_user_id = ?")
      .get(userId)?.c ?? 0;
  const converted =
    db
      .prepare(
        "SELECT COUNT(*) as c FROM merchant_referrals WHERE referrer_user_id = ? AND status IN ('converted', 'rewarded')",
      )
      .get(userId)?.c ?? 0;
  const discounts = db
    .prepare(
      `SELECT discount_type, discount_pct, months_total, months_used, status
       FROM merchant_referral_discounts
       WHERE user_id = ? AND status IN ('pending', 'active')
       ORDER BY created_at ASC`,
    )
    .all(userId);
  return { total: Number(total), converted: Number(converted), discounts };
}
