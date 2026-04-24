/**
 * Synchronise l’état d’abonnement App Store (RevenueCat) → table `subscriptions`
 * pour que `hasActiveSubscription` reflète l’IAP, pas seulement Stripe.
 *
 * Règles :
 * - On ne remplace jamais une ligne d’abonnement **Stripe réelle** (`sub_…`) par l’IAP.
 * - Les achats 100 % App Store utilisent un identifiant factice `revenuecat_iap` (voir subscriptions.js).
 */

import logger from "../lib/logger.js";
import { getRevenueCatEntitlementId } from "./revenuecat-entitlement.js";
import { fetchRevenueCatSubscriber } from "./revenuecat-api.js";
import {
  createOrUpdateSubscription,
  getSubscriptionByUserId,
  deactivateRevenueCatOnlySubscription,
  REVENUECAT_STRIPE_SUB_ID_SENTINEL,
} from "../db/subscriptions.js";

function parseExpiresToIso(ent) {
  if (!ent || typeof ent !== "object") return null;
  const v = ent.expires_date;
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s === "null") return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function isEntitlementActiveFromPayload(ent) {
  if (!ent || typeof ent !== "object") return false;
  const iso = parseExpiresToIso(ent);
  if (iso) return new Date(iso) > new Date();
  if (ent.expires_date == null) return true;
  return false;
}

/**
 * Récupère l’entitlement côté JSON subscriber RevenueCat (v1).
 */
function pickEntitlement(subscriber) {
  const id = getRevenueCatEntitlementId();
  const m = subscriber?.entitlements;
  if (!m || typeof m !== "object") return null;
  return m[id] ?? null;
}

/**
 * Synchronise la base à partir de l’API REST RevenueCat (source de vérité).
 * @param {string} appUserId — en général `user.id` MyFidpass (idempot).
 */
export async function syncPremiumFromRevenueCatAppUserId(appUserId) {
  const userId = String(appUserId || "").trim();
  if (!userId) return { ok: false, reason: "no_user" };

  const row = getSubscriptionByUserId(userId);
  const sid = row?.stripe_subscription_id ? String(row.stripe_subscription_id).trim() : "";
  if (sid && !sid.startsWith("revenuecat_")) {
    return { ok: true, skipped: true, reason: "stripe_subscription_in_place" };
  }

  const data = await fetchRevenueCatSubscriber(userId);
  if (!data) {
    return { ok: false, reason: "fetch_failed" };
  }

  const ent = pickEntitlement(data.subscriber);
  if (!ent || !isEntitlementActiveFromPayload(ent)) {
    deactivateRevenueCatOnlySubscription(userId);
    return { ok: true, active: false };
  }

  const periodEnd = parseExpiresToIso(ent) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  createOrUpdateSubscription({
    userId,
    stripeCustomerId: null,
    stripeSubscriptionId: REVENUECAT_STRIPE_SUB_ID_SENTINEL,
    planId: "pro",
    status: "active",
    currentPeriodEnd: periodEnd,
  });
  return { ok: true, active: true };
}

export async function applyRevenueCatWebhookHint(body) {
  const t = (body?.event || body)?.type || body?.type;
  if (t === "TEST") return;
  const appUserId = body?.event?.app_user_id || body?.app_user_id;
  if (!appUserId) {
    return;
  }
  try {
    const r = await syncPremiumFromRevenueCatAppUserId(String(appUserId));
    logger.info(
      { appUserId: String(appUserId), eventType: t, result: r },
      "[revenuecat] webhook sync",
    );
  } catch (err) {
    logger.error({ err, appUserId }, "[revenuecat] webhook sync error");
  }
}
