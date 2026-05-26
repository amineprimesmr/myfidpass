/**
 * Push FCM pour l'app Android commerçant MyFidpass (fr.myfidpass).
 *
 * Variables d'environnement :
 *   FIREBASE_SERVICE_ACCOUNT_JSON       — JSON complet du compte de service Firebase
 *   FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 — alternative base64 du JSON
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import logger from "./lib/logger.js";

/** @type {import('firebase-admin/messaging').Messaging | null} */
let messaging = null;
/** @type {string | null} */
let fcmError = null;

function loadServiceAccountJson() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON illisible : ${err?.message ?? err}`);
    }
  }
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 illisible : ${err?.message ?? err}`);
    }
  }
  return null;
}

function getFcmMessaging() {
  if (messaging) return messaging;
  if (getApps().length > 0) {
    messaging = getMessaging();
    return messaging;
  }
  try {
    const sa = loadServiceAccountJson();
    if (!sa) {
      fcmError = "FIREBASE_SERVICE_ACCOUNT_JSON non configuré (push Android indisponible)";
      return null;
    }
    initializeApp({ credential: cert(sa) });
    messaging = getMessaging();
    fcmError = null;
    return messaging;
  } catch (err) {
    fcmError = err?.message ?? String(err);
    logger.warn({ err }, "[fcm] init failed");
    return null;
  }
}

export function getFcmUnavailableReason() {
  getFcmMessaging();
  return fcmError;
}

/** @param {unknown} err */
export function isLikelyInvalidFcmTokenError(err) {
  const code = String(err?.code ?? err?.errorInfo?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    code.includes("registration-token-not-registered") ||
    code.includes("invalid-registration-token") ||
    code.includes("invalid-argument") && msg.includes("token") ||
    msg.includes("not registered") ||
    msg.includes("invalid registration")
  );
}

/**
 * @param {string} deviceToken
 * @param {{ body: string, title?: string, category?: string, data?: Record<string, string> }} payload
 * @returns {Promise<{ sent: boolean, error?: string, rawError?: unknown }>}
 */
export async function sendFcmMerchantAppAlert(deviceToken, payload) {
  const fcm = getFcmMessaging();
  if (!fcm) {
    return { sent: false, error: fcmError ?? "FCM non configuré" };
  }
  const body = (payload.body ?? "").trim();
  if (!body) return { sent: false, error: "Message vide" };

  const title = (payload.title ?? "MyFidpass").trim() || "MyFidpass";
  /** @type {Record<string, string>} */
  const data = {};
  if (payload.category) data.category = String(payload.category);
  if (payload.data && typeof payload.data === "object") {
    for (const [k, v] of Object.entries(payload.data)) {
      if (v != null) data[k] = String(v);
    }
  }

  try {
    await fcm.send({
      token: deviceToken,
      notification: { title, body },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: "myfidpass_merchant_default",
          sound: "default",
        },
      },
    });
    return { sent: true };
  } catch (err) {
    logger.warn({ err, tokenPrefix: deviceToken.slice(0, 12) }, "[fcm] merchant alert failed");
    return { sent: false, error: String(err?.message ?? err), rawError: err };
  }
}

/**
 * Push data-only : réveille l'app Android pour sync dashboard (aligné APNs silencieux iOS).
 *
 * @param {string} deviceToken
 * @param {Record<string, string>} [data]
 * @returns {Promise<{ sent: boolean, error?: string, rawError?: unknown }>}
 */
export async function sendFcmMerchantSilentSync(deviceToken, data = {}) {
  const fcm = getFcmMessaging();
  if (!fcm) {
    return { sent: false, error: fcmError ?? "FCM non configuré" };
  }
  /** @type {Record<string, string>} */
  const payloadData = { myfidpass_action: "dashboard_sync", ...data };
  for (const k of Object.keys(payloadData)) {
    const v = payloadData[k];
    if (v != null && typeof v !== "string") payloadData[k] = String(v);
  }

  try {
    await fcm.send({
      token: deviceToken,
      data: payloadData,
      android: { priority: "high" },
    });
    return { sent: true };
  } catch (err) {
    logger.warn({ err, tokenPrefix: deviceToken.slice(0, 12) }, "[fcm] silent sync failed");
    return { sent: false, error: String(err?.message ?? err), rawError: err };
  }
}
