/**
 * Envoi de notifications APNs pour mise à jour des passes Apple Wallet.
 * Utilise le même certificat que la signature des passes (signer cert + key).
 * Payload vide : Apple exige un payload vide pour signaler "pass mis à jour".
 *
 * Utilise apns2 (HTTP/2 natif Node.js) — remplace apn@2.2.0 (3 CVE haute gravité
 * via jsonwebtoken + node-forge).
 */
import { ApnsClient, Notification, Errors } from "apns2";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import logger from "./lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const certsDir = join(__dirname, "..", "certs");

// ——— Helpers de chargement de credentials ———

function loadSignerCertAndKey() {
  const signerKeyPassphrase = process.env.SIGNER_KEY_PASSPHRASE || undefined;
  const signerCertPem = process.env.SIGNER_CERT_PEM?.trim();
  const signerKeyPem = process.env.SIGNER_KEY_PEM?.trim();
  if (signerCertPem && signerKeyPem && signerCertPem.includes("BEGIN")) {
    return {
      cert: Buffer.from(signerCertPem, "utf8"),
      key: Buffer.from(signerKeyPem, "utf8"),
      ...(signerKeyPassphrase && { passphrase: signerKeyPassphrase }),
    };
  }
  const signerCertB64 = process.env.SIGNER_CERT_PEM_BASE64?.trim();
  const signerKeyB64 = process.env.SIGNER_KEY_PEM_BASE64?.trim();
  if (signerCertB64 && signerKeyB64) {
    return {
      cert: Buffer.from(signerCertB64, "base64"),
      key: Buffer.from(signerKeyB64, "base64"),
      ...(signerKeyPassphrase && { passphrase: signerKeyPassphrase }),
    };
  }
  const signerCertPath = join(certsDir, "signerCert.pem");
  const signerKeyPath = join(certsDir, "signerKey.pem");
  if (existsSync(signerCertPath) && existsSync(signerKeyPath)) {
    return {
      cert: readFileSync(signerCertPath),
      key: readFileSync(signerKeyPath),
      ...(signerKeyPassphrase && { passphrase: signerKeyPassphrase }),
    };
  }
  return null;
}

function loadMerchantP8Key() {
  const p8Raw = process.env.MERCHANT_APNS_KEY_P8?.trim();
  const p8B64 = process.env.MERCHANT_APNS_KEY_P8_BASE64?.trim();
  if (p8Raw && p8Raw.includes("BEGIN")) {
    return Buffer.from(p8Raw, "utf8");
  }
  if (p8B64) {
    try {
      return Buffer.from(p8B64, "base64");
    } catch (_) {
      return null;
    }
  }
  return null;
}

// ——— PassKit provider (certificat Pass Type ID) ———

let providerInstance = undefined; // undefined = pas encore tenté
let providerError = null;

export function getApnsUnavailableReason() {
  if (providerInstance) return null;
  if (providerError) return providerError;
  if (!process.env.PASS_TYPE_ID?.trim()) {
    return "PASS_TYPE_ID manquant. Ajoute-le dans les variables d'environnement Railway (ex. pass.com.tonentreprise.fidelity).";
  }
  const creds = loadSignerCertAndKey();
  if (!creds) {
    return "Certificat signataire Apple manquant. Sur Railway, définis SIGNER_CERT_PEM_BASE64 et SIGNER_KEY_PEM_BASE64 (base64 de signerCert.pem et signerKey.pem). Voir docs/APPLE-WALLET-SETUP.md.";
  }
  return "APNs non configuré (erreur à l'initialisation).";
}

function getProvider() {
  if (providerInstance !== undefined) return providerInstance;
  providerError = null;
  const passTypeId = process.env.PASS_TYPE_ID?.trim();
  const creds = loadSignerCertAndKey();
  logger.debug({ hasPassTypeId: !!passTypeId, hasCreds: !!creds }, "[apns] getProvider");
  if (!passTypeId) {
    providerError =
      "PASS_TYPE_ID manquant. Ajoute-le dans les variables d'environnement Railway (ex. pass.com.tonentreprise.fidelity).";
    providerInstance = null;
    return null;
  }
  if (!creds) {
    providerError =
      "Certificat signataire Apple manquant. Sur Railway: SIGNER_CERT_PEM_BASE64 et SIGNER_KEY_PEM_BASE64 (base64 de signerCert.pem et signerKey.pem). Voir docs/APPLE-WALLET-SETUP.md.";
    providerInstance = null;
    return null;
  }
  const certLen = creds.cert?.length || 0;
  const keyLen = creds.key?.length || 0;
  logger.debug({ certBytes: certLen, keyBytes: keyLen }, "[apns] Chargement certificat");
  if (certLen === 0 || keyLen === 0) {
    providerError = "Certificat ou clé vide. Vérifie SIGNER_CERT_PEM_BASE64 et SIGNER_KEY_PEM_BASE64 sur Railway.";
    providerInstance = null;
    return null;
  }
  try {
    // apns2 accepte les Buffers directement — plus besoin de fichiers temporaires.
    providerInstance = new ApnsClient({
      cert: creds.cert,
      key: creds.key,
      ...(creds.passphrase && { passphrase: creds.passphrase }),
      production: process.env.NODE_ENV === "production",
      topic: passTypeId,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    logger.warn({ err }, "[apns] Impossible de créer le provider APNs");
    providerError = `APNs : ${msg}. Utilise le certificat Pass Type ID (même que pour signer les passes), pas un certificat APNs app.`;
    providerInstance = null;
  }
  return providerInstance;
}

/** Limite chaque envoi APNs PassKit pour éviter de bloquer le handler HTTP. */
const PASSKIT_APNS_SEND_TIMEOUT_MS = 25_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout après ${ms} ms`)), ms)
    ),
  ]);
}

/**
 * Envoie une notification "pass mis à jour" à un device (Apple Wallet).
 * Payload vide comme requis par Apple pour PassKit.
 * @param {string} deviceToken - Token push du device (hex)
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export function sendPassKitUpdate(deviceToken) {
  const prov = getProvider();
  if (!prov) {
    const reason = getApnsUnavailableReason();
    return Promise.resolve({ sent: false, error: reason || "APNs non configuré" });
  }
  const passTypeId = process.env.PASS_TYPE_ID;
  if (!passTypeId) return Promise.resolve({ sent: false, error: "PASS_TYPE_ID manquant" });

  // Payload vide {} requis par PassKit. apns2 sérialise { aps: {} } → accepté par Apple.
  const note = new Notification(deviceToken, {
    aps: {},
    id: randomUUID(),
    expiry: Math.floor(Date.now() / 1000) + 3600,
    topic: passTypeId,
  });

  const sendPromise = prov.send(note).then(
    () => ({ sent: true }),
    (err) => {
      const reason = err?.reason || err?.message || String(err);
      return { sent: false, error: reason };
    }
  );
  return withTimeout(sendPromise, PASSKIT_APNS_SEND_TIMEOUT_MS, "PassKit APNs").catch((err) => ({
    sent: false,
    error: err?.message || String(err),
  }));
}

// ——— APNs pour l'app iOS commerçant (bundle com.myfidpass) : clé .p8 (Auth Key) ———

let merchantProviderInstance = undefined;
let merchantProviderError = null;

function getMerchantProvider() {
  if (merchantProviderInstance !== undefined) return merchantProviderInstance;
  merchantProviderError = null;
  const keyId = process.env.MERCHANT_APNS_KEY_ID?.trim();
  const teamId = process.env.MERCHANT_APNS_TEAM_ID?.trim();
  const signingKey = loadMerchantP8Key();
  const bundleId = process.env.MERCHANT_APP_BUNDLE_ID?.trim() || "com.myfidpass";
  if (!keyId || !teamId || !signingKey) {
    merchantProviderError =
      "Clé APNs app commerçant manquante : définissez MERCHANT_APNS_KEY_ID, MERCHANT_APNS_TEAM_ID et MERCHANT_APNS_KEY_P8 (ou MERCHANT_APNS_KEY_P8_BASE64) sur Railway.";
    merchantProviderInstance = null;
    return null;
  }
  try {
    merchantProviderInstance = new ApnsClient({
      team: teamId,
      keyId,
      signingKey,
      defaultTopic: bundleId,
      production: process.env.NODE_ENV === "production",
    });
  } catch (err) {
    const msg = err?.message || String(err);
    logger.warn({ err }, "[apns] Merchant app provider");
    merchantProviderError = `APNs app commerçant : ${msg}`;
    merchantProviderInstance = null;
  }
  return merchantProviderInstance;
}

export function getMerchantApnsUnavailableReason() {
  const p = getMerchantProvider();
  if (p) return null;
  return merchantProviderError || "APNs app commerçant non configuré.";
}

/**
 * Notification visible (titre + corps) sur l'app iOS commerçant.
 * @param {string} deviceToken - Token hex enregistré via POST /api/device/register
 * @param {{ title?: string, body: string }} payload
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export function sendMerchantAppAlert(deviceToken, payload) {
  const prov = getMerchantProvider();
  if (!prov) {
    const reason = getMerchantApnsUnavailableReason();
    return Promise.resolve({ sent: false, error: reason || "APNs app commerçant non configuré" });
  }
  const body = (payload.body || "").trim();
  if (!body) return Promise.resolve({ sent: false, error: "Message vide" });

  const note = new Notification(deviceToken, {
    aps: {
      alert: body,
      sound: "default",
    },
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });

  return prov.send(note).then(
    () => ({ sent: true }),
    (err) => {
      const reason = err?.reason || err?.message || String(err);
      return { sent: false, error: String(reason) };
    }
  );
}

/** Marqueur pour vérifier que le bon build est déployé (doit apparaître dans les logs Railway). */
const APNS_BUILD = "2026-03-27-apns2";

export function logApnsStatus() {
  const prov = getProvider();
  if (prov) {
    logger.info({ build: APNS_BUILD }, "[apns] APNs prêt (certificat + PASS_TYPE_ID OK)");
    return;
  }
  const reason = getApnsUnavailableReason();
  logger.warn({ build: APNS_BUILD, reason }, "[apns] APNs non disponible");
}

export function logMerchantApnsStatus() {
  const p = getMerchantProvider();
  if (p) {
    const bid = process.env.MERCHANT_APP_BUNDLE_ID?.trim() || "com.myfidpass";
    logger.info({ topic: bid }, "[apns] App commerçant APNs prêt");
    return;
  }
  logger.info("[apns] App commerçant (optionnel) : clé .p8 non définie — alertes push dans l'app Myfidpass désactivées (Wallet/PassKit non impacté)");
}

/** Ferme la connexion APNs (à appeler au shutdown). */
export function shutdownApns() {
  if (providerInstance) {
    providerInstance.destroy?.();
    providerInstance = null;
  }
  if (merchantProviderInstance) {
    merchantProviderInstance.destroy?.();
    merchantProviderInstance = null;
  }
}
