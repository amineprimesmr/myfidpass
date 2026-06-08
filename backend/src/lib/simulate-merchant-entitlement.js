/**
 * Active un abonnement / quota commerces fictif (bouton TEST paywall, admin console).
 */
import {
  createOrUpdateSubscription,
  getSubscriptionByUserId,
  upsertMerchantEntitlement,
} from "../db/subscriptions.js";

export const DEV_SIMULATED_SUB_ID = "dev_simulated";

export function simulateMerchantEntitlementForUser(userId, allowedBusinesses = 5) {
  const slots = Math.min(5, Math.max(1, Math.floor(Number(allowedBusinesses) || 5)));
  const planId = "starter";
  createOrUpdateSubscription({
    userId,
    stripeCustomerId: "cus_dev_simulated",
    stripeSubscriptionId: DEV_SIMULATED_SUB_ID,
    planId,
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });
  upsertMerchantEntitlement({
    userId,
    allowedBusinesses: slots,
    billingProvider: "stripe",
    status: "active",
    source: "dev_simulate",
  });
  const sub = getSubscriptionByUserId(userId);
  return {
    ok: true,
    status: sub?.status ?? "active",
    simulated: true,
    has_active_subscription: true,
    allowed_businesses: slots,
  };
}
