/**
 * Repository subscriptions (Stripe / abonnements). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getUserById } from "./users.js";

const db = getDb();

/**
 * Durée d’accès complet **sans abonnement Stripe payant** après création du compte.
 * Priorité : `MERCHANT_TRIAL_HOURS` (ex. 24) puis `MERCHANT_TRIAL_DAYS`, sinon **24 h**.
 */
export function merchantTrialDurationMs() {
  const hoursRaw = process.env.MERCHANT_TRIAL_HOURS;
  if (hoursRaw !== undefined && String(hoursRaw).trim() !== "") {
    const h = parseInt(hoursRaw, 10);
    if (Number.isFinite(h) && h >= 0) return h * 60 * 60 * 1000;
  }
  const n = parseInt(process.env.MERCHANT_TRIAL_DAYS, 10);
  if (Number.isFinite(n) && n >= 0) return n * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function userCreatedAtMs(user) {
  if (!user?.created_at) return null;
  let s = String(user.created_at).trim();
  if (!s) return null;
  if (!s.includes("T")) s = s.replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Fin de la fenêtre d’essai (ISO UTC), ou `null` si date de création illisible. */
export function getMerchantTrialEndsAtIso(userId) {
  if (!userId) return null;
  const user = getUserById(String(userId).trim());
  const start = userCreatedAtMs(user);
  if (start == null) return null;
  return new Date(start + merchantTrialDurationMs()).toISOString();
}

/** Essai actif : pas d’abo Stripe « payant » et encore dans les N premiers jours après inscription. */
export function isUserInMerchantTrial(userId) {
  if (!userId || hasActiveSubscription(userId)) return false;
  const endIso = getMerchantTrialEndsAtIso(userId);
  if (!endIso) return false;
  return Date.now() < Date.parse(endIso);
}

/** Accès opérationnel (scan, points, campagnes, etc.) : Stripe actif ou période d’essai gratuite. */
export function hasOperationalMerchantAccess(userId) {
  if (!userId) return false;
  return hasActiveSubscription(userId) || isUserInMerchantTrial(userId);
}

export const PLANS = { starter: { max_businesses: 1 }, pro: { max_businesses: 5 } };

export function getSubscriptionByUserId(userId) {
  const row = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").get(userId);
  return row || null;
}

export function getSubscriptionByStripeSubscriptionId(stripeSubscriptionId) {
  if (!stripeSubscriptionId) return null;
  const row = db.prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?").get(String(stripeSubscriptionId));
  return row || null;
}

export function hasActiveSubscription(userId) {
  const sub = getSubscriptionByUserId(userId);
  if (!sub) return false;
  const st = String(sub.status || "")
    .trim()
    .toLowerCase();
  // past_due : carte en échec mais abonnement encore « vivant » côté Stripe (souvent période de grâce) — évite un faux « non abonné ».
  return st === "active" || st === "trialing" || st === "past_due";
}

export function getBusinessCountByUserId(userId) {
  const row = db.prepare("SELECT COUNT(*) as c FROM businesses WHERE user_id = ?").get(userId);
  return (row && row.c) || 0;
}

export function canCreateBusiness(userId) {
  if (!userId) return false;
  const count = getBusinessCountByUserId(userId);
  // Premier commerce autorisé sans abonnement (inscription app / onboarding, aligné besoin revue produit).
  if (count === 0) return true;
  if (!hasOperationalMerchantAccess(userId)) return false;
  const sub = getSubscriptionByUserId(userId);
  const plan = PLANS[sub?.plan_id] || PLANS.starter;
  return count < plan.max_businesses;
}

export function createOrUpdateSubscription({ userId, stripeCustomerId, stripeSubscriptionId, planId, status, currentPeriodEnd }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const existing = getSubscriptionByUserId(userId);
  if (existing) {
    db.prepare(
      `UPDATE subscriptions SET stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id),
       plan_id = COALESCE(?, plan_id), status = ?, current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE user_id = ?`
    ).run(stripeCustomerId || null, stripeSubscriptionId || null, planId || null, status, currentPeriodEnd || null, now, userId);
    return getSubscriptionByUserId(userId);
  }
  db.prepare(
    `INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, stripeCustomerId || null, stripeSubscriptionId || null, planId || "starter", status, currentPeriodEnd || null);
  return getSubscriptionByUserId(userId);
}
