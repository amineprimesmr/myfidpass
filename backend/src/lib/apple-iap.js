/**
 * Abonnements App Store (StoreKit 2) — validation transaction + synchro base.
 */
import jwt from "jsonwebtoken";
import { createPrivateKey } from "crypto";
import {
  createOrUpdateSubscription,
  upsertMerchantEntitlement,
  getSubscriptionByUserId,
  getMerchantEntitlementByUserId,
  getMerchantBusinessEntitlements,
  getSubscriptionByStripeSubscriptionId,
  resetMerchantEntitlementAfterLegacyIapRemoval,
} from "../db/subscriptions.js";
import {
  subscriptionStatusFromApplePayload,
  expiresMsFromApplePayload,
} from "./apple-iap-status.js";
import {
  appAccountTokenFromApplePayload,
  appAccountTokenUuidForUserId,
  resolveUserIdForAppAccountToken,
} from "./app-account-token.js";
import { isProductionEnvironment } from "./production-env.js";

export { subscriptionStatusFromApplePayload, expiresMsFromApplePayload } from "./apple-iap-status.js";
export { isProductionEnvironment } from "./production-env.js";

export const APPLE_IAP_SUBSCRIPTION_PREFIX = "apple_iap:";

const DEFAULT_MONTHLY_PRODUCT_IDS = ["MFPmensuel", "com.myfidpass.pro.monthly"];
const DEFAULT_ANNUAL_PRODUCT_IDS = ["MFPannuel", "com.myfidpass.pro.annual"];

/** Forfaits multi-commerces (mensuel uniquement sur App Store Connect). */
const APPLE_IAP_SLOTS_PRODUCT_IDS = {
  "com.myfidpass.merchant.slots2.monthly": 2,
  "com.myfidpass.merchant.slots3.monthly": 3,
  "com.myfidpass.merchant.slots4.monthly": 4,
  "com.myfidpass.merchant.slots5.monthly": 5,
  "com.myfidpass.merchant.slots2": 2,
  "com.myfidpass.merchant.slots3": 3,
  "com.myfidpass.merchant.slots4": 4,
  "com.myfidpass.merchant.slots5": 5,
};

function configuredProductIds(envKey, defaults) {
  const raw = process.env[envKey];
  if (!raw || !String(raw).trim()) return defaults;
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function appleIapMonthlyProductIds() {
  return configuredProductIds("APPLE_IAP_PRODUCT_ID_MONTHLY", DEFAULT_MONTHLY_PRODUCT_IDS);
}

export function appleIapAnnualProductIds() {
  return configuredProductIds("APPLE_IAP_PRODUCT_ID_ANNUAL", DEFAULT_ANNUAL_PRODUCT_IDS);
}

export function allKnownAppleProductIds() {
  return [
    ...appleIapMonthlyProductIds(),
    ...appleIapAnnualProductIds(),
    ...Object.keys(APPLE_IAP_SLOTS_PRODUCT_IDS),
  ];
}

export function appleSubscriptionSentinel(originalTransactionId) {
  const id = String(originalTransactionId || "").trim();
  if (!id) return null;
  return `${APPLE_IAP_SUBSCRIPTION_PREFIX}${id}`;
}

export function isAppleBackedSubscriptionId(stripeSubscriptionId) {
  const sid = String(stripeSubscriptionId || "").trim();
  return sid.startsWith(APPLE_IAP_SUBSCRIPTION_PREFIX);
}

function appStorePrivateKeyPem() {
  const raw = process.env.APP_STORE_PRIVATE_KEY;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).replace(/\\n/g, "\n");
}

export function isAppStoreServerApiConfigured() {
  return Boolean(
    process.env.APP_STORE_ISSUER_ID &&
      process.env.APP_STORE_KEY_ID &&
      appStorePrivateKeyPem(),
  );
}

function appStoreApiHost() {
  return process.env.APP_STORE_ENVIRONMENT === "sandbox"
    ? "api.storekit-sandbox.itunes.apple.com"
    : "api.storekit.itunes.apple.com";
}

function buildAppStoreApiJwt() {
  const issuerId = process.env.APP_STORE_ISSUER_ID;
  const keyId = process.env.APP_STORE_KEY_ID;
  const pem = appStorePrivateKeyPem();
  const bundleId = process.env.APPLE_BUNDLE_ID || "com.myfidpass";
  if (!issuerId || !keyId || !pem) return null;
  const privateKey = createPrivateKey({ key: pem, format: "pem" });
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: now + 1200,
      aud: "appstoreconnect-v1",
      bid: bundleId,
    },
    privateKey,
    { algorithm: "ES256", header: { alg: "ES256", kid: keyId, typ: "JWT" } },
  );
}

/** Décode le JWS renvoyé par l’API Apple (payload issu du serveur Apple, pas du client seul). */
export function decodeStoreKitJwsPayload(signedPayload) {
  const parts = String(signedPayload || "").trim().split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function assertKnownProductId(productId) {
  const pid = String(productId || "").trim();
  if (!pid || !allKnownAppleProductIds().includes(pid)) {
    const err = new Error("unknown_apple_product_id");
    err.code = "apple_unknown_product";
    throw err;
  }
}

function planIdFromProductId(productId) {
  assertKnownProductId(productId);
  return "pro";
}

export function allowedBusinessesFromAppleProductId(productId) {
  const pid = String(productId || "").trim();
  const slots = APPLE_IAP_SLOTS_PRODUCT_IDS[pid];
  if (slots != null) return slots;
  if (appleIapMonthlyProductIds().includes(pid) || appleIapAnnualProductIds().includes(pid)) {
    return 1;
  }
  return 1;
}

function assertBundleMatches(payload) {
  const expected = process.env.APPLE_BUNDLE_ID || "com.myfidpass";
  const bundle = String(payload?.bundleId || payload?.bid || "").trim();
  if (!bundle) {
    if (isProductionEnvironment()) {
      const err = new Error("missing_bundle_id");
      err.code = "apple_bundle_mismatch";
      throw err;
    }
    return;
  }
  if (bundle !== expected) {
    const err = new Error("bundle_id_mismatch");
    err.code = "apple_bundle_mismatch";
    throw err;
  }
}

function assertAppAccountTokenMatches(userId, payload) {
  const tokenFromApple = appAccountTokenFromApplePayload(payload);
  if (!tokenFromApple) {
    return;
  }
  const expected = appAccountTokenUuidForUserId(userId);
  if (expected && tokenFromApple !== expected) {
    const err = new Error("app_account_token_mismatch");
    err.code = "apple_app_account_token_mismatch";
    throw err;
  }
}

function assertTransactionOwnership(userId, originalId) {
  const sentinel = appleSubscriptionSentinel(originalId);
  if (!sentinel) return;
  const existing = getSubscriptionByStripeSubscriptionId(sentinel);
  if (!existing) return;
  const ownerId = String(existing.user_id || "").trim();
  const requestUserId = String(userId || "").trim();
  if (ownerId && requestUserId && ownerId !== requestUserId) {
    const err = new Error("apple_transaction_owned_by_other_user");
    err.code = "apple_transaction_owned_by_other_user";
    throw err;
  }
}

export async function fetchSignedTransactionFromAppStore(transactionId) {
  const token = buildAppStoreApiJwt();
  if (!token) return null;
  const tid = String(transactionId || "").trim();
  if (!tid) return null;
  const url = `https://${appStoreApiHost()}/inApps/v1/transactions/${encodeURIComponent(tid)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(`app_store_transaction_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const signed = body?.signedTransactionInfo;
  if (!signed) return null;
  return decodeStoreKitJwsPayload(signed);
}

/** Dernière transaction d’un abonnement auto-renouvelable (reconcile / expiration). */
export async function fetchLatestAppleSubscriptionPayload(originalTransactionId) {
  const token = buildAppStoreApiJwt();
  if (!token) return null;
  const oid = String(originalTransactionId || "").trim();
  if (!oid) return null;
  const url = `https://${appStoreApiHost()}/inApps/v1/subscriptions/${encodeURIComponent(oid)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(`app_store_subscription_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const groups = body?.data;
  if (!Array.isArray(groups) || groups.length === 0) return null;
  for (const group of groups) {
    const items = group?.lastTransactions;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const signed = item?.signedTransactionInfo;
      if (!signed) continue;
      const payload = decodeStoreKitJwsPayload(signed);
      if (payload) return payload;
    }
  }
  return null;
}

function deactivateAppleEntitlementForUser(userId) {
  resetMerchantEntitlementAfterLegacyIapRemoval(userId);
}

/**
 * Applique une transaction Apple validée à la ligne `subscriptions` du commerçant.
 */
export async function applyAppleTransactionToUser(userId, payload) {
  if (!userId || !payload) {
    const err = new Error("invalid_apple_transaction");
    err.code = "invalid_apple_transaction";
    throw err;
  }
  assertBundleMatches(payload);
  assertKnownProductId(payload.productId);
  const originalId = String(payload.originalTransactionId || payload.original_transaction_id || "").trim();
  if (!originalId) {
    const err = new Error("missing_original_transaction_id");
    err.code = "missing_original_transaction_id";
    throw err;
  }
  assertAppAccountTokenMatches(userId, payload);
  assertTransactionOwnership(userId, originalId);

  const status = subscriptionStatusFromApplePayload(payload);
  const expiresMs = expiresMsFromApplePayload(payload);
  const currentPeriodEnd = expiresMs != null ? new Date(expiresMs).toISOString() : null;
  const sub = createOrUpdateSubscription({
    userId,
    stripeCustomerId: null,
    stripeSubscriptionId: appleSubscriptionSentinel(originalId),
    planId: planIdFromProductId(payload.productId),
    status,
    currentPeriodEnd,
  });

  const paying = status === "active" || status === "trialing" || status === "past_due";
  if (paying) {
    const fromProduct = allowedBusinessesFromAppleProductId(payload.productId);
    const existing = getMerchantEntitlementByUserId(userId);
    const prior = existing ? Math.max(0, Math.floor(Number(existing.allowed_businesses) || 0)) : 0;
    const allowedBusinesses = Math.max(fromProduct, prior);
    upsertMerchantEntitlement({
      userId,
      allowedBusinesses,
      billingProvider: "apple",
      status: "active",
      source: "apple_iap",
      effectiveTo: currentPeriodEnd,
    });
  } else {
    deactivateAppleEntitlementForUser(userId);
  }

  const entitlements = getMerchantBusinessEntitlements(userId);
  return {
    subscription: sub,
    has_active_subscription: paying,
    has_paid_merchant_subscription: paying,
    subscription_status: status,
    original_transaction_id: originalId,
    entitlements,
    allowed_businesses: entitlements.allowed_businesses,
    used_businesses: entitlements.used_businesses,
    can_create_business: entitlements.can_create_business,
  };
}

/**
 * Valide une transaction via l’API App Store Server (prod obligatoire) puis met à jour la base.
 */
export async function syncAppleSubscriptionForUser(userId, { signedTransactionInfo, transactionId }) {
  const signed = String(signedTransactionInfo || "").trim();
  const tid = String(transactionId || "").trim();
  let payload = null;
  let source = "app_store_server_api";

  if (isProductionEnvironment()) {
    if (!isAppStoreServerApiConfigured()) {
      const err = new Error("App Store Server API non configurée en production.");
      err.code = "apple_api_required";
      throw err;
    }
    if (!tid) {
      const err = new Error("transaction_id requis en production.");
      err.code = "missing_apple_transaction_id";
      throw err;
    }
    payload = await fetchSignedTransactionFromAppStore(tid);
    if (!payload) {
      const err = new Error("Transaction Apple introuvable.");
      err.code = "apple_transaction_invalid";
      throw err;
    }
  } else if (isAppStoreServerApiConfigured() && tid) {
    try {
      payload = await fetchSignedTransactionFromAppStore(tid);
    } catch (e) {
      console.warn("[apple-iap] dev: API Apple indisponible:", e?.message || e);
    }
  }

  if (!payload && signed && !isProductionEnvironment()) {
    payload = decodeStoreKitJwsPayload(signed);
    source = "storekit_jws_dev_only";
    console.warn("[apple-iap] dev: repli JWS client — interdit en production.");
  }

  if (!payload) {
    const err = new Error("Transaction Apple introuvable ou illisible.");
    err.code = "apple_transaction_invalid";
    throw err;
  }

  if (tid) {
    const decodedId = String(payload.transactionId || payload.transaction_id || "").trim();
    if (decodedId && decodedId !== tid) {
      const err = new Error("transaction_id_mismatch");
      err.code = "transaction_id_mismatch";
      throw err;
    }
  }

  const result = await applyAppleTransactionToUser(userId, payload);
  return { ...result, source };
}

/** Réaligne l’abonnement Apple stocké en re-interrogeant Apple (pas de confiance aveugle à la DB). */
export async function reconcileAppleSubscriptionForUser(userId) {
  const sub = getSubscriptionByUserId(userId);
  if (!sub) return null;
  const sid = String(sub.stripe_subscription_id || "").trim();
  if (!isAppleBackedSubscriptionId(sid)) return null;
  const originalId = sid.slice(APPLE_IAP_SUBSCRIPTION_PREFIX.length);
  if (!originalId) return null;

  if (!isAppStoreServerApiConfigured()) {
    if (isProductionEnvironment()) {
      const err = new Error("App Store Server API non configurée.");
      err.code = "apple_api_required";
      throw err;
    }
    return null;
  }

  const payload = await fetchLatestAppleSubscriptionPayload(originalId);
  if (!payload) return null;
  return applyAppleTransactionToUser(userId, payload);
}

const APPLE_WEBHOOK_IGNORED_TYPES = new Set([
  "TEST",
  "EXTERNAL_PURCHASE_TOKEN",
  "ONE_TIME_CHARGE",
  "CONSUMPTION_REQUEST",
]);

/**
 * App Store Server Notifications v2 — renouvellements, expirations, révocations.
 * URL à configurer dans App Store Connect → App → App Store Server Notifications.
 */
export async function handleAppleServerNotification(body) {
  const signedPayload = String(body?.signedPayload || "").trim();
  if (!signedPayload) {
    const err = new Error("missing_signed_payload");
    err.code = "missing_signed_payload";
    throw err;
  }
  const notification = decodeStoreKitJwsPayload(signedPayload);
  if (!notification) {
    const err = new Error("invalid_signed_payload");
    err.code = "invalid_signed_payload";
    throw err;
  }

  const notificationType = String(notification.notificationType || "").trim();
  if (APPLE_WEBHOOK_IGNORED_TYPES.has(notificationType)) {
    return { ok: true, ignored: notificationType };
  }

  const data = notification.data || {};
  let txPayload = null;
  if (data.signedTransactionInfo) {
    txPayload = decodeStoreKitJwsPayload(data.signedTransactionInfo);
  }

  if (!txPayload) {
    console.warn("[apple-webhook] notification sans transaction:", notificationType);
    return { ok: true, skipped: "no_transaction", notificationType };
  }

  const originalId = String(
    txPayload.originalTransactionId || txPayload.original_transaction_id || "",
  ).trim();
  if (!originalId) {
    return { ok: true, skipped: "no_original_transaction_id", notificationType };
  }

  let userId = null;
  const existing = getSubscriptionByStripeSubscriptionId(appleSubscriptionSentinel(originalId));
  if (existing?.user_id) userId = String(existing.user_id).trim();
  if (!userId) {
    userId = resolveUserIdForAppAccountToken(appAccountTokenFromApplePayload(txPayload));
  }
  if (!userId) {
    console.warn("[apple-webhook] utilisateur introuvable:", { notificationType, originalId });
    return { ok: true, skipped: "no_user", notificationType, originalId };
  }

  const result = await applyAppleTransactionToUser(userId, txPayload);
  return {
    ok: true,
    notificationType,
    userId,
    has_active_subscription: result.has_active_subscription,
    subscription_status: result.subscription_status,
  };
}
