/**
 * Repository subscriptions (Stripe / abonnements). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getUserById } from "./users.js";

const db = getDb();

/**
 * Durée d’accès complet **sans abonnement Stripe payant** après création du compte.
 * Priorité : `MERCHANT_TRIAL_HOURS` puis `MERCHANT_TRIAL_DAYS`, sinon **3 j** (aligné offre 3 j gratuits).
 */
export function merchantTrialDurationMs() {
  const hoursRaw = process.env.MERCHANT_TRIAL_HOURS;
  if (hoursRaw !== undefined && String(hoursRaw).trim() !== "") {
    const h = parseInt(hoursRaw, 10);
    if (Number.isFinite(h) && h >= 0) return h * 60 * 60 * 1000;
  }
  const n = parseInt(process.env.MERCHANT_TRIAL_DAYS, 10);
  if (Number.isFinite(n) && n >= 0) return n * 24 * 60 * 60 * 1000;
  return 3 * 24 * 60 * 60 * 1000;
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

/** Essai actif : pas d’abo Stripe / IAP « payant » et encore dans la fenêtre d’essai après inscription (`MERCHANT_TRIAL_DAYS`, défaut 3 j). */
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

/**
 * Valeur de `stripe_subscription_id` pour un abonnement 100 % App Store (RevenueCat),
 * distinct d’un vrai abonnement Stripe `sub_…`.
 */
export const REVENUECAT_STRIPE_SUB_ID_SENTINEL = "revenuecat_iap";

export function getDefaultAllowedBusinessesFromLegacyPlan(planId) {
  const key = String(planId || "starter")
    .trim()
    .toLowerCase();
  const plan = PLANS[key] || PLANS.starter;
  return Math.max(1, Number(plan.max_businesses) || 1);
}

export function getMerchantEntitlementByUserId(userId) {
  if (!userId) return null;
  const row = db
    .prepare(
      `SELECT user_id, allowed_businesses, billing_provider, status, source, effective_from, effective_to, created_at, updated_at
       FROM merchant_entitlements
       WHERE user_id = ?`,
    )
    .get(userId);
  return row || null;
}

export function upsertMerchantEntitlement({
  userId,
  allowedBusinesses,
  billingProvider,
  status = "active",
  source = null,
  effectiveFrom = null,
  effectiveTo = null,
}) {
  if (!userId) return null;
  const now = new Date().toISOString();
  const allowed = Math.max(1, Math.floor(Number(allowedBusinesses) || 1));
  db.prepare(
    `INSERT INTO merchant_entitlements
      (user_id, allowed_businesses, billing_provider, status, source, effective_from, effective_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       allowed_businesses = excluded.allowed_businesses,
       billing_provider = COALESCE(excluded.billing_provider, merchant_entitlements.billing_provider),
       status = excluded.status,
       source = COALESCE(excluded.source, merchant_entitlements.source),
       effective_from = COALESCE(excluded.effective_from, merchant_entitlements.effective_from),
       effective_to = excluded.effective_to,
       updated_at = excluded.updated_at`,
  ).run(
    userId,
    allowed,
    billingProvider || null,
    status || "active",
    source || null,
    effectiveFrom || now,
    effectiveTo || null,
    now,
    now,
  );
  return getMerchantEntitlementByUserId(userId);
}

export function resolveEffectiveAllowedBusinesses(userId) {
  // Pendant l'essai gratuit commerçant, on autorise l'ajout de commerces sans plafond strict.
  if (isUserInMerchantTrial(userId)) {
    return 999;
  }
  const entitlement = getMerchantEntitlementByUserId(userId);
  if (entitlement) {
    return Math.max(1, Math.floor(Number(entitlement.allowed_businesses) || 1));
  }
  const sub = getSubscriptionByUserId(userId);
  return getDefaultAllowedBusinessesFromLegacyPlan(sub?.plan_id);
}

export function getMerchantBusinessEntitlements(userId) {
  const usedBusinesses = getBusinessCountByUserId(userId);
  const allowedBusinesses = resolveEffectiveAllowedBusinesses(userId);
  if (usedBusinesses > allowedBusinesses) {
    console.warn("[entitlements] quota_incoherence", { userId, usedBusinesses, allowedBusinesses });
  }
  const ent = getMerchantEntitlementByUserId(userId);
  const provider = ent?.billing_provider || null;
  return {
    allowed_businesses: allowedBusinesses,
    used_businesses: usedBusinesses,
    can_create_business: usedBusinesses < allowedBusinesses,
    billing_provider: provider,
  };
}

/**
 * Passe l’abonnement à `canceled` seulement s’il provenait d’IAP (sentinel revenuecat_…).
 * Ne modifie pas un abonnement Stripe réel.
 */
export function deactivateRevenueCatOnlySubscription(userId) {
  if (!userId) return null;
  const s = getSubscriptionByUserId(userId);
  if (!s) return null;
  const subId = s.stripe_subscription_id ? String(s.stripe_subscription_id).trim() : "";
  if (subId && !subId.startsWith("revenuecat_")) {
    return s;
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE user_id = ?").run(now, userId);
  return getSubscriptionByUserId(userId);
}

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
  const allowed = resolveEffectiveAllowedBusinesses(userId);
  return count < allowed;
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
