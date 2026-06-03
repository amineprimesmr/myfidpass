/**
 * Signatures JWS pour offres App Store (intro 1 €) — clé « In-App Purchase » App Store Connect.
 * @see https://developer.apple.com/documentation/storekit/generating-jws-to-sign-app-store-requests
 */
import { IntroductoryOfferEligibilitySignatureCreator } from "@apple/app-store-server-library";
import { hasPaidMerchantSubscription } from "../db/subscriptions.js";
import { allKnownAppleProductIds } from "./apple-iap.js";

function readSigningConfig() {
  const issuerId = String(
    process.env.APP_STORE_ISSUER_ID || process.env.APPLE_IAP_ISSUER_ID || "",
  ).trim();
  const keyId = String(process.env.APP_STORE_KEY_ID || process.env.APPLE_IAP_KEY_ID || "").trim();
  const bundleId = String(process.env.APPLE_BUNDLE_ID || "com.myfidpass").trim();
  let signingKey = String(process.env.APP_STORE_PRIVATE_KEY || process.env.APPLE_IAP_PRIVATE_KEY || "").trim();
  if (!signingKey && process.env.APPLE_IAP_PRIVATE_KEY_BASE64) {
    try {
      signingKey = Buffer.from(String(process.env.APPLE_IAP_PRIVATE_KEY_BASE64), "base64").toString("utf8");
    } catch (_) {}
  }
  signingKey = signingKey.replace(/\\n/g, "\n");
  if (!issuerId || !keyId || !signingKey || !bundleId) return null;
  return { issuerId, keyId, signingKey, bundleId };
}

export function isAppleIapOfferSigningConfigured() {
  return readSigningConfig() != null;
}

function normalizeProductId(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  const known = new Set(allKnownAppleProductIds());
  if (!known.has(id)) return null;
  return id;
}

/**
 * Autorise l’intro 1 € côté MyFidpass si le compte n’a pas encore d’abonnement payant actif
 * (indépendamment de l’historique Apple ID sur d’autres apps — l’éligibilité est rétablie via JWS).
 */
export function merchantMayReceiveIntroductoryOffer(userId) {
  if (!userId) return false;
  return !hasPaidMerchantSubscription(userId);
}

/**
 * @param {{ productId: string, transactionId: string, userId: string }} params
 * @returns {string} compact JWS pour Product.PurchaseOption.introductoryOfferEligibility(compactJWS:)
 */
export function createIntroductoryOfferEligibilityJWS({ productId, transactionId, userId }) {
  const cfg = readSigningConfig();
  if (!cfg) {
    throw new Error("APPLE_IAP_SIGNING_NOT_CONFIGURED");
  }
  const pid = normalizeProductId(productId);
  if (!pid) {
    throw new Error("INVALID_PRODUCT_ID");
  }
  const tx = String(transactionId || "").trim();
  if (!tx) {
    throw new Error("MISSING_TRANSACTION_ID");
  }
  const allow = merchantMayReceiveIntroductoryOffer(userId);
  const creator = new IntroductoryOfferEligibilitySignatureCreator(
    cfg.signingKey,
    cfg.keyId,
    cfg.issuerId,
    cfg.bundleId,
  );
  return creator.createSignature(pid, allow, tx);
}
