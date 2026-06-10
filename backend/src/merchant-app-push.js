/**
 * Routage push app commerçant : APNs (iOS) ou FCM (Android).
 * Détection automatique du format de token — pas de colonne platform requise.
 */
import {
  sendMerchantAppAlert as sendApnsAlert,
  sendMerchantSilentDashboardSync as sendApnsSilent,
  isLikelyInvalidDeviceTokenApnsError,
} from "./apns.js";
import {
  sendFcmMerchantAppAlert,
  sendFcmMerchantSilentSync,
  isLikelyInvalidFcmTokenError,
} from "./fcm.js";

/** @typedef {'apns' | 'fcm' | 'invalid'} MerchantPushKind */

/**
 * @param {string | null | undefined} token
 * @returns {MerchantPushKind}
 */
export function classifyMerchantPushToken(token) {
  const t = String(token ?? "").trim();
  if (!t || t.startsWith("android-local-")) return "invalid";
  if (/^[a-f0-9]{64}$/i.test(t)) return "apns";
  if (t.length >= 20) return "fcm";
  return "invalid";
}

/**
 * @param {string} deviceToken
 * @param {{ body: string, title?: string, category?: string, data?: Record<string, string> }} payload
 */
export async function sendMerchantAppAlert(deviceToken, payload) {
  const kind = classifyMerchantPushToken(deviceToken);
  if (kind === "invalid") {
    return { sent: false, error: "Token push commerçant invalide" };
  }
  if (kind === "fcm") {
    return sendFcmMerchantAppAlert(deviceToken, payload);
  }
  return sendApnsAlert(deviceToken, payload);
}

/**
 * @param {string} deviceToken
 * @param {Record<string, string>} [data]
 */
export async function sendMerchantSilentDashboardSync(deviceToken, data = {}) {
  const kind = classifyMerchantPushToken(deviceToken);
  if (kind === "invalid") {
    return { sent: false, error: "Token push commerçant invalide" };
  }
  if (kind === "fcm") {
    return sendFcmMerchantSilentSync(deviceToken, data);
  }
  return sendApnsSilent(deviceToken, data);
}

/**
 * @param {unknown} err
 * @param {string} deviceToken
 */
export function isLikelyInvalidMerchantPushTokenError(err, deviceToken) {
  const kind = classifyMerchantPushToken(deviceToken);
  if (kind === "fcm") return isLikelyInvalidFcmTokenError(err);
  if (kind === "apns") return isLikelyInvalidDeviceTokenApnsError(err);
  return false;
}