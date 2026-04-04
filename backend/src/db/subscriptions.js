/**
 * Repository subscriptions (Stripe / abonnements). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

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
  if (!hasActiveSubscription(userId)) return false;
  const sub = getSubscriptionByUserId(userId);
  const plan = PLANS[sub.plan_id] || PLANS.starter;
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
