/**
 * Envoi de notifications APNs pour mise à jour des passes Apple Wallet
 * et alertes push sur l'app iOS commerçant.
 *
 * Utilise apns2@12 (undici HTTP/2 + fast-jwt) — remplace apn@2.2.0
 * (3 CVE haute gravité via jsonwebtoken + node-forge).
 *
 * apns2@12 utilise exclusivement l'authentification par token (clé .p8 APNs
 * Auth Key depuis Apple Developer Console). Apple supporte ce mode pour PassKit
 * depuis 2016 : la clé SIGNER_CERT reste uniquement pour signer les .pkpass.
 *
 * Variables d'environnement requises pour les push Wallet :
 *   APNS_KEY_ID           — ID de la clé APNs (ex. ABCDE12345)
 *   APNS_TEAM_ID          — Team ID Apple (ex. XXXXXXXXXX)
 *   APNS_KEY_P8           — Contenu brut du fichier .p8 (ou via APNS_KEY_P8_BASE64)
 *   APNS_KEY_P8_BASE64    — Contenu base64 du .p8 (alternative à APNS_KEY_P8)
 *   PASS_TYPE_ID          — Pass Type Identifier (ex. pass.com.yourcompany.fidelity)
 *
 * Variables optionnelles pour l'app commerçant (si différentes de ci-dessus) :
 *   MERCHANT_APNS_KEY_ID  — sinon APNS_KEY_ID est utilisé
 *   MERCHANT_APNS_TEAM_ID — sinon APNS_TEAM_ID est utilisé
 *   MERCHANT_APNS_KEY_P8  — sinon APNS_KEY_P8 est utilisé
 *   MERCHANT_APP_BUNDLE_ID — défaut : com.myfidpass
 */
import { ApnsClient, Notification, Errors } from "apns2";
import logger from "./lib/logger.js";

// ——— Helpers p8 ———

function loadP8Key(envRaw, envBase64) {
  const raw = process.env[envRaw]?.trim();
  if (raw && raw.includes("BEGIN")) return raw;
  const b64 = process.env[envBase64]?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) return decoded;
    } catch (_) {}
  }
  return null;
}

// ——— PassKit provider (token-based — clé .p8 APNs) ———

let passkitProvider = undefined; // undefined = pas encore initialisé, null = échec
let passkitError = null;

function getPasskitProvider() {
  if (passkitProvider !== undefined) return passkitProvider;
  passkitError = null;

  const keyId = (process.env.APNS_KEY_ID ?? "").trim();
  const teamId = (process.env.APNS_TEAM_ID ?? "").trim();
  const signingKey = loadP8Key("APNS_KEY_P8", "APNS_KEY_P8_BASE64");
  const passTypeId = (process.env.PASS_TYPE_ID ?? "").trim();

  if (!passTypeId) {
    passkitError =
      "PASS_TYPE_ID manquant. Définis-le sur Railway (ex. pass.com.tonentreprise.fidelity).";
    passkitProvider = null;
    return null;
  }
  if (!keyId || !teamId || !signingKey) {
    passkitError =
      "Clé APNs manquante. Sur Railway, définis APNS_KEY_ID, APNS_TEAM_ID et APNS_KEY_P8 (contenu de ta clé .p8 Apple Developer Console → Keys → APNs Auth Key). " +
      "Cette clé est différente du certificat de signature des passes : elle sert uniquement aux push notifications.";
    passkitProvider = null;
    return null;
  }
  try {
    passkitProvider = new ApnsClient({
      team: teamId,
      keyId,
      signingKey,
      defaultTopic: passTypeId,
      host: process.env.NODE_ENV === "production"
        ? "api.push.apple.com"
        : "api.sandbox.push.apple.com",
    });
    logger.debug({ keyId, passTypeId }, "[apns] PassKit provider prêt");
  } catch (err) {
    passkitError = `APNs PassKit : ${err?.message ?? String(err)}`;
    logger.warn({ err }, "[apns] PassKit provider erreur");
    passkitProvider = null;
  }
  return passkitProvider;
}

export function getApnsUnavailableReason() {
  if (passkitProvider !== undefined) {
    return passkitProvider ? null : passkitError;
  }
  getPasskitProvider(); // init
  return passkitProvider ? null : passkitError;
}

const PASSKIT_TIMEOUT_MS = 25_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout après ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Envoie une notification "pass mis à jour" (payload vide) à un device Apple Wallet.
 * @param {string} deviceToken
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export function sendPassKitUpdate(deviceToken) {
  const prov = getPasskitProvider();
  if (!prov) {
    return Promise.resolve({ sent: false, error: passkitError ?? "APNs non configuré" });
  }
  const passTypeId = process.env.PASS_TYPE_ID;
  if (!passTypeId) return Promise.resolve({ sent: false, error: "PASS_TYPE_ID manquant" });

  // Payload vide requis par Apple PassKit.
  // apns2 v12 sérialise { aps: {} } → accepté par Apple (équivalent à {}).
  const note = new Notification(deviceToken, {
    topic: passTypeId,
    expiration: Math.floor(Date.now() / 1000) + 3600,
    aps: {},
  });

  const sendPromise = prov.send(note).then(
    () => ({ sent: true }),
    (err) => ({ sent: false, error: err?.reason ?? err?.message ?? String(err) })
  );
  return withTimeout(sendPromise, PASSKIT_TIMEOUT_MS, "PassKit APNs").catch((err) => ({
    sent: false,
    error: err?.message ?? String(err),
  }));
}

// ——— App commerçant (token-based, réutilise les mêmes credentials par défaut) ———

let merchantProvider = undefined;
let merchantError = null;

function getMerchantProvider() {
  if (merchantProvider !== undefined) return merchantProvider;
  merchantError = null;

  const keyId   = (process.env.MERCHANT_APNS_KEY_ID  ?? process.env.APNS_KEY_ID  ?? "").trim();
  const teamId  = (process.env.MERCHANT_APNS_TEAM_ID ?? process.env.APNS_TEAM_ID ?? "").trim();
  const p8Raw   = process.env.MERCHANT_APNS_KEY_P8   ?? process.env.APNS_KEY_P8;
  const p8B64   = process.env.MERCHANT_APNS_KEY_P8_BASE64 ?? process.env.APNS_KEY_P8_BASE64;
  const bundleId = (process.env.MERCHANT_APP_BUNDLE_ID ?? "com.myfidpass").trim();

  const signingKey = (() => {
    if (p8Raw?.trim().includes("BEGIN")) return p8Raw.trim();
    if (p8B64?.trim()) {
      try {
        const decoded = Buffer.from(p8B64.trim(), "base64").toString("utf8");
        if (decoded.includes("BEGIN")) return decoded;
      } catch (_) {}
    }
    return null;
  })();

  if (!keyId || !teamId || !signingKey) {
    merchantError =
      "Clé APNs app commerçant manquante (optionnel). " +
      "Définis MERCHANT_APNS_KEY_ID, MERCHANT_APNS_TEAM_ID et MERCHANT_APNS_KEY_P8 sur Railway " +
      "(ou réutilise APNS_KEY_ID/APNS_TEAM_ID/APNS_KEY_P8 si même compte Apple Developer).";
    merchantProvider = null;
    return null;
  }
  try {
    merchantProvider = new ApnsClient({
      team: teamId,
      keyId,
      signingKey,
      defaultTopic: bundleId,
      host: process.env.NODE_ENV === "production"
        ? "api.push.apple.com"
        : "api.sandbox.push.apple.com",
    });
  } catch (err) {
    merchantError = `APNs app commerçant : ${err?.message ?? String(err)}`;
    logger.warn({ err }, "[apns] Merchant provider erreur");
    merchantProvider = null;
  }
  return merchantProvider;
}

export function getMerchantApnsUnavailableReason() {
  getMerchantProvider();
  return merchantProvider ? null : merchantError;
}

/**
 * Notification push visible sur l'app iOS commerçant.
 * @param {string} deviceToken
 * @param {{ body: string, title?: string }} payload
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export function sendMerchantAppAlert(deviceToken, payload) {
  const prov = getMerchantProvider();
  if (!prov) {
    return Promise.resolve({ sent: false, error: merchantError ?? "APNs app commerçant non configuré" });
  }
  const body = (payload.body ?? "").trim();
  if (!body) return Promise.resolve({ sent: false, error: "Message vide" });

  const bundleId = (process.env.MERCHANT_APP_BUNDLE_ID ?? "com.myfidpass").trim();
  const note = new Notification(deviceToken, {
    topic: bundleId,
    expiration: Math.floor(Date.now() / 1000) + 3600,
    alert: body,
    sound: "default",
  });

  return prov.send(note).then(
    () => ({ sent: true }),
    (err) => ({ sent: false, error: String(err?.reason ?? err?.message ?? err) })
  );
}

// ——— Status / shutdown ———

const APNS_BUILD = "2026-03-27-apns2-v12";

export function logApnsStatus() {
  const prov = getPasskitProvider();
  if (prov) {
    logger.info({ build: APNS_BUILD }, "[apns] PassKit APNs prêt (token p8 OK)");
  } else {
    logger.warn({ build: APNS_BUILD, reason: passkitError }, "[apns] PassKit APNs non disponible");
  }
}

export function logMerchantApnsStatus() {
  const prov = getMerchantProvider();
  if (prov) {
    const topic = (process.env.MERCHANT_APP_BUNDLE_ID ?? "com.myfidpass").trim();
    logger.info({ topic }, "[apns] App commerçant APNs prêt");
  } else {
    logger.info("[apns] App commerçant APNs optionnel : non configuré — alertes push iOS désactivées (Wallet non impacté)");
  }
}

export async function shutdownApns() {
  if (passkitProvider) {
    await passkitProvider.destroy().catch(() => {});
    passkitProvider = null;
  }
  if (merchantProvider) {
    await merchantProvider.destroy().catch(() => {});
    merchantProvider = null;
  }
}
