/**
 * Annulation des abonnements facturés avant suppression définitive du compte.
 * Apple IAP : l’abonnement reste actif sur l’Apple ID (règle App Store) — seule la liaison MyFidpass est supprimée.
 */
import Stripe from "stripe";
import {
  getSubscriptionByUserId,
  getBusinessSubscriptionsByUserId,
} from "../db/subscriptions.js";

const stripe =
  process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

async function cancelStripeSubscriptionId(stripeSubscriptionId) {
  const sid = String(stripeSubscriptionId || "").trim();
  if (!/^sub_[A-Za-z0-9]+$/.test(sid) || !stripe) return false;
  try {
    await stripe.subscriptions.cancel(sid);
    return true;
  } catch (e) {
    console.warn("[deleteUserAccount] Stripe cancel failed:", sid, e?.message || e);
    return false;
  }
}

/**
 * @param {string} userId
 * @returns {Promise<{ stripeCanceled: number, hadAppleIap: boolean }>}
 */
export async function cancelPaidSubscriptionsBeforeAccountDeletion(userId) {
  if (!userId) return { stripeCanceled: 0, hadAppleIap: false };
  let stripeCanceled = 0;
  let hadAppleIap = false;

  const sub = getSubscriptionByUserId(userId);
  if (sub) {
    const sid = String(sub.stripe_subscription_id || "").trim();
    if (sid.startsWith("apple_iap:")) {
      hadAppleIap = true;
    } else if (await cancelStripeSubscriptionId(sid)) {
      stripeCanceled += 1;
    }
  }

  for (const row of getBusinessSubscriptionsByUserId(userId)) {
    const sid = String(row.stripe_subscription_id || "").trim();
    if (sid.startsWith("apple_iap:")) {
      hadAppleIap = true;
      continue;
    }
    if (await cancelStripeSubscriptionId(sid)) {
      stripeCanceled += 1;
    }
  }

  return { stripeCanceled, hadAppleIap };
}
