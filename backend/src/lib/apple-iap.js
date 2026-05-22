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
} from "../db/subscriptions.js";

export const APPLE_IAP_SUBSCRIPTION_PREFIX = "apple_iap:";

const DEFAULT_MONTHLY_PRODUCT_IDS = ["MFPmensuel", "com.myfidpass.pro.monthly"];
const DEFAULT_ANNUAL_PRODUCT_IDS = ["MFPannuel", "com.myfidpass.pro.annual"];

/** Forfaits multi-commerces (mensuel uniquement sur App Store Connect). */
const APPLE_IAP_SLOTS_PRODUCT_IDS = {
  "com.myfidpass.merchant.slots2.monthly": 2,
  "com.myfidpass.merchant.slots3.monthly": 3,
  "com.myfidpass.merchant.slots4.monthly": 4,
  "com.myfidpass.merchant.slots5.monthly": 5,
  // Alias legacy (StoreKit local / anciennes builds — jamais approuvés sur Connect).
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

/** Décode le payload JSON d’un JWS StoreKit (sans vérification crypto — complété par l’API Apple si configurée). */
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

function msFromAppleTimestamp(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function subscriptionStatusFromApplePayload(payload) {
  const now = Date.now();
  const expiresMs = msFromAppleTimestamp(payload?.expiresDate);
  const graceMs = msFromAppleTimestamp(payload?.gracePeriodExpiresDate);
  const revokeMs = msFromAppleTimestamp(payload?.revocationDate);
  if (revokeMs != null && revokeMs <= now) return "canceled";
  if (expiresMs != null && expiresMs > now) return "active";
  if (graceMs != null && graceMs > now) return "past_due";
  if (expiresMs != null) return "canceled";
  return "active";
}

function planIdFromProductId(productId) {
  const pid = String(productId || "").trim();
  if (appleIapAnnualProductIds().includes(pid)) return "pro";
  if (appleIapMonthlyProductIds().includes(pid)) return "pro";
  if (APPLE_IAP_SLOTS_PRODUCT_IDS[pid]) return "pro";
  return "pro";
}

/**
 * Nombre de commerces autorisés selon le produit IAP Apple acheté.
 * @param {string} productId
 * @returns {number} 1–5
 */
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
  if (!bundle) return;
  if (bundle !== expected) {
    const err = new Error("bundle_id_mismatch");
    err.code = "apple_bundle_mismatch";
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

/**
 * Applique une transaction Apple validée à la ligne `subscriptions` du commerçant.
 * @returns {{ subscription: object, has_active_subscription: boolean }}
 */
export async function applyAppleTransactionToUser(userId, payload) {
  if (!userId || !payload) {
    const err = new Error("invalid_apple_transaction");
    err.code = "invalid_apple_transaction";
    throw err;
  }
  assertBundleMatches(payload);
  const originalId = String(payload.originalTransactionId || payload.original_transaction_id || "").trim();
  if (!originalId) {
    const err = new Error("missing_original_transaction_id");
    err.code = "missing_original_transaction_id";
    throw err;
  }
  const status = subscriptionStatusFromApplePayload(payload);
  const expiresMs = msFromAppleTimestamp(payload.expiresDate);
  const currentPeriodEnd = expiresMs != null ? new Date(expiresMs).toISOString() : null;
  const sub = createOrUpdateSubscription({
    userId,
    stripeCustomerId: null,
    stripeSubscriptionId: appleSubscriptionSentinel(originalId),
    planId: planIdFromProductId(payload.productId),
    status,
    currentPeriodEnd,
  });
  if (status === "active" || status === "trialing" || status === "past_due") {
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
  }
  return {
    subscription: sub,
    has_active_subscription: status === "active" || status === "trialing" || status === "past_due",
    subscription_status: status,
    original_transaction_id: originalId,
  };
}

/**
 * Valide `signedTransactionInfo` (JWS StoreKit 2) puis met à jour la base.
 */
export async function syncAppleSubscriptionForUser(userId, { signedTransactionInfo, transactionId }) {
  let payload = null;
  const signed = String(signedTransactionInfo || "").trim();
  const tid = String(transactionId || "").trim();

  if (isAppStoreServerApiConfigured() && tid) {
    payload = await fetchSignedTransactionFromAppStore(tid);
  }
  if (!payload && signed) {
    payload = decodeStoreKitJwsPayload(signed);
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
  return applyAppleTransactionToUser(userId, payload);
}

export function hasAppleBackedActiveSubscription(userId) {
  const sub = getSubscriptionByUserId(userId);
  if (!sub) return false;
  const st = String(sub.status || "")
    .trim()
    .toLowerCase();
  if (!(st === "active" || st === "trialing" || st === "past_due")) return false;
  return isAppleBackedSubscriptionId(sub.stripe_subscription_id);
}
