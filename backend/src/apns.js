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
 * Optionnel :
 *   APNS_USE_SANDBOX=true — force api.sandbox.push.apple.com (tests ; les jetons Wallet prod exigent l’hôte prod).
 *
 * Variables optionnelles pour l'app commerçant (si différentes de ci-dessus) :
 *   MERCHANT_APNS_KEY_ID  — sinon APNS_KEY_ID est utilisé
 *   MERCHANT_APNS_TEAM_ID — sinon APNS_TEAM_ID est utilisé
 *   MERCHANT_APNS_KEY_P8  — sinon APNS_KEY_P8 est utilisé
 *   MERCHANT_APP_BUNDLE_ID — défaut : com.myfidpass
 */
import { createPrivateKey } from "node:crypto";
import { createSigner } from "fast-jwt";
import { ApnsClient, Notification, SilentNotification, PushType } from "apns2";
import logger from "./lib/logger.js";

const APNS_BUILD = "2026-03-27-apns2-v12-fastjwt-validate";

/** En-tête PEM Apple Auth Key (.p8) : PKCS#8 « BEGIN PRIVATE KEY » ou legacy « BEGIN EC PRIVATE KEY ». */
const PEM_APNS_AUTH_KEY = /-----BEGIN\s+(?:EC\s+)?PRIVATE KEY-----/;

/**
 * Railway / Vercel : la clé est souvent sur une ligne avec des "\\n" littéraux,
 * ou entourée de guillemets JSON. Sans normalisation, apns2 accepte le client
 * mais le 1er JWT échoue avec « The key option must be a string… » (fast-jwt).
 */
export function normalizeApnsP8String(raw) {
  if (raw == null || typeof raw !== "string") return null;
  let s = raw.replace(/^\uFEFF/, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s.includes("\\n") && !s.includes("\n")) {
    s = s.replace(/\\n/g, "\n");
  }
  s = s.replace(/\r\n/g, "\n");
  return s.trim();
}

function looksLikePemP8(s) {
  return typeof s === "string" && s.length > 80 && PEM_APNS_AUTH_KEY.test(s);
}

/**
 * @param {string} envRaw
 * @param {string} envBase64
 * @returns {string | null}
 */
function loadP8Key(envRaw, envBase64) {
  const normalized = normalizeApnsP8String(process.env[envRaw]);
  if (normalized && looksLikePemP8(normalized)) return normalized;
  const b64 = process.env[envBase64]?.trim();
  if (b64) {
    try {
      const decoded = normalizeApnsP8String(Buffer.from(b64, "base64").toString("utf8"));
      if (decoded && looksLikePemP8(decoded)) return decoded;
    } catch (_) {}
  }
  return null;
}

/**
 * Même logique que loadP8Key pour le commerçant, avec repli sur APNS_*.
 */
function loadMerchantP8Key() {
  const m = loadP8Key("MERCHANT_APNS_KEY_P8", "MERCHANT_APNS_KEY_P8_BASE64");
  if (m) return m;
  return loadP8Key("APNS_KEY_P8", "APNS_KEY_P8_BASE64");
}

/** Hôte APNs : prod par défaut en NODE_ENV=production ; surcharge explicite pour tests. */
export function apnsHost() {
  if (process.env.APNS_USE_SANDBOX === "1" || process.env.APNS_USE_SANDBOX === "true") {
    return "api.sandbox.push.apple.com";
  }
  return process.env.NODE_ENV === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";
}

/**
 * Vérifie que la clé est un PEM EC lisible et que le JWT APNs (ES256 + kid) se signe.
 * Reproduit le chemin apns2 → fast-jwt avant le tout premier envoi réseau.
 */
function validateP8AndJwtForApns(teamId, keyId, pem) {
  try {
    createPrivateKey({ key: pem, format: "pem" });
  } catch (err) {
    const msg = err?.message ?? String(err);
    throw new Error(
      `Clé .p8 illisible ou tronquée (PEM). Recopiez le fichier Auth Key complet depuis Apple Developer, ou utilisez APNS_KEY_P8_BASE64. Détail crypto : ${msg}`
    );
  }
  try {
    const signer = createSigner({ key: pem, algorithm: "ES256", kid: keyId });
    signer({ iss: teamId, iat: Math.floor(Date.now() / 1000) });
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (msg.includes("key option must be") || msg.includes("key option is missing")) {
      throw new Error(
        "La clé APNS_KEY_P8 est vide ou mal formatée après lecture des variables d’environnement. " +
          "Sur Railway : collez le PEM complet (lignes BEGIN/END), ou une seule ligne avec \\n échappés, ou APNS_KEY_P8_BASE64."
      );
    }
    throw new Error(`Signature JWT APNs (ES256) impossible. Vérifiez APNS_KEY_ID et que la clé .p8 correspond à ce Key ID. Détail : ${msg}`);
  }
}

function friendlyApnsInitError(err) {
  const m = err?.message ?? String(err);
  return `Configuration APNs : ${m}`;
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
    validateP8AndJwtForApns(teamId, keyId, signingKey);
  } catch (err) {
    passkitError = friendlyApnsInitError(err);
    logger.warn({ err }, "[apns] PassKit — validation clé .p8 / JWT refusée");
    passkitProvider = null;
    return null;
  }

  try {
    passkitProvider = new ApnsClient({
      team: teamId,
      keyId,
      signingKey,
      defaultTopic: passTypeId,
      host: apnsHost(),
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

/** Diagnostic HTTP (aucun secret : longueurs et indicateurs booléens seulement). */
export function getApnsHealthForDiagnostics() {
  const pem = loadP8Key("APNS_KEY_P8", "APNS_KEY_P8_BASE64");
  const reason = getApnsUnavailableReason();
  const raw = normalizeApnsP8String(process.env.APNS_KEY_P8);
  return {
    ok: !reason,
    build: APNS_BUILD,
    host: apnsHost(),
    passTypeIdPresent: !!(process.env.PASS_TYPE_ID ?? "").trim(),
    keyIdPresent: !!(process.env.APNS_KEY_ID ?? "").trim(),
    teamIdPresent: !!(process.env.APNS_TEAM_ID ?? "").trim(),
    apnsKeyP8RawCharCount: raw ? raw.length : 0,
    apnsKeyP8Base64Present: !!(process.env.APNS_KEY_P8_BASE64 ?? "").trim(),
    pemLoaded: !!pem,
    pemCharCount: pem ? pem.length : 0,
    reason: reason || undefined,
  };
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
 * Erreur réseau / connexion HTTP2 (undici) distincte d'un refus APNs nominatif.
 * Quand err.reason est vide, l'erreur est au niveau transport → recycler le provider.
 */
function isConnectionLevelError(err) {
  if (err?.reason) return false; // APNs a répondu → connexion OK, token invalide
  const s = String(err?.message ?? err ?? "").toLowerCase();
  return (
    s.includes("und_err") ||
    s.includes("econnreset") ||
    s.includes("econnrefused") ||
    s.includes("etimedout") ||
    s.includes("socket hang up") ||
    s.includes("h2_or_hpack_error") ||
    s.includes("network") ||
    s.includes("timeout") ||
    s.includes("connect")
  );
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

  // PassKit Wallet : Apple exige impérativement apns-push-type: background.
  // Avec le type "alert" (défaut Notification), iOS ne réveille PAS PassKit en background :
  // la notification est mise en queue et traitée de façon opportuniste (aléatoire), ce qui
  // cause les délais et la réception "seulement à l'ouverture de l'app".
  // Expiration 86400s (24h) : si le téléphone est offline, Apple retentera pendant 24h.
  // priority: 10 (immediate) est le défaut de Notification — Apple autorise priority 10
  // pour les background PassKit updates (exception à la règle background=priority 5).
  const note = new Notification(deviceToken, {
    topic: passTypeId,
    expiration: Math.floor(Date.now() / 1000) + 86400,
    type: PushType.background,
    aps: {},
  });

  const sendPromise = prov.send(note).then(
    () => ({ sent: true }),
    (err) => {
      // Erreur réseau / HTTP2 : la connexion est morte. On recycle le provider
      // pour que le prochain appel crée une nouvelle connexion undici propre.
      if (isConnectionLevelError(err)) {
        logger.warn({ errMsg: err?.message }, "[apns] Connexion HTTP/2 APNs morte — provider recyclé pour le prochain envoi");
        passkitProvider = undefined;
      }
      return { sent: false, error: err?.reason ?? err?.message ?? String(err) };
    }
  );
  return withTimeout(sendPromise, PASSKIT_TIMEOUT_MS, "PassKit APNs").catch((err) => {
    // Timeout = connexion bloquée → recycler aussi
    if (passkitProvider !== undefined) {
      logger.warn("[apns] Timeout APNs — provider recyclé");
      passkitProvider = undefined;
    }
    return { sent: false, error: err?.message ?? String(err) };
  });
}

// ——— App commerçant (token-based, réutilise les mêmes credentials par défaut) ———

let merchantProvider = undefined;
let merchantError = null;

function getMerchantProvider() {
  if (merchantProvider !== undefined) return merchantProvider;
  merchantError = null;

  const keyId = (process.env.MERCHANT_APNS_KEY_ID ?? process.env.APNS_KEY_ID ?? "").trim();
  const teamId = (process.env.MERCHANT_APNS_TEAM_ID ?? process.env.APNS_TEAM_ID ?? "").trim();
  const bundleId = (process.env.MERCHANT_APP_BUNDLE_ID ?? "com.myfidpass").trim();
  const signingKey = loadMerchantP8Key();

  if (!keyId || !teamId || !signingKey) {
    merchantError =
      "Clé APNs app commerçant manquante (optionnel). " +
      "Définis MERCHANT_APNS_KEY_ID, MERCHANT_APNS_TEAM_ID et MERCHANT_APNS_KEY_P8 sur Railway " +
      "(ou réutilise APNS_KEY_ID/APNS_TEAM_ID/APNS_KEY_P8 si même compte Apple Developer).";
    merchantProvider = null;
    return null;
  }

  try {
    validateP8AndJwtForApns(teamId, keyId, signingKey);
  } catch (err) {
    merchantError = friendlyApnsInitError(err);
    logger.warn({ err }, "[apns] Merchant — validation clé .p8 / JWT refusée");
    merchantProvider = null;
    return null;
  }

  try {
    merchantProvider = new ApnsClient({
      team: teamId,
      keyId,
      signingKey,
      defaultTopic: bundleId,
      host: apnsHost(),
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
 * Erreur APNs typique : token device invalide ou révoqué — à purger côté base.
 *
 * NOTE : `invalidprovidertoken` est intentionnellement EXCLU — c'est une erreur
 * de credentials côté serveur (clé .p8 / keyId incorrects), pas un device token
 * invalide. L'inclure entraînerait la suppression de TOUS les tokens clients
 * si la clé APNs expire ou est mal configurée.
 */
export function isLikelyInvalidDeviceTokenApnsError(err) {
  const s = String(err?.reason ?? err?.message ?? err ?? "").toLowerCase();
  return (
    s.includes("baddevicetoken") ||
    s.includes("unregistered") ||
    s.includes("devicetokennotfortopic")
  );
}

/**
 * Notification push visible sur l'app iOS commerçant.
 * @param {string} deviceToken
 * @param {{ body: string, title?: string, category?: string, data?: Record<string, string> }} payload
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
  const title = (payload.title ?? "").trim();
  const alert = title ? { title, body } : body;
  /** @type {Record<string, unknown>} */
  const opts = {
    topic: bundleId,
    expiration: Math.floor(Date.now() / 1000) + 3600,
    alert,
    sound: "default",
  };
  if (payload.category && typeof payload.category === "string") {
    opts.category = payload.category;
  }
  if (payload.data && typeof payload.data === "object") {
    opts.data = payload.data;
  }
  const note = new Notification(deviceToken, opts);

  return prov.send(note).then(
    () => ({ sent: true }),
    (err) => {
      if (isConnectionLevelError(err)) {
        merchantProvider = undefined;
      }
      return { sent: false, error: String(err?.reason ?? err?.message ?? err) };
    }
  );
}

/**
 * Push silencieux (content-available, apns-push-type background) : réveille l’app commerçant
 * pour un pull API sans bannière ni son. Même clé APNs / topic que `sendMerchantAppAlert`.
 *
 * @param {string} deviceToken
 * @param {Record<string, string>} [data] — clés custom (tout en chaînes côté payload).
 * @returns {Promise<{ sent: boolean, error?: string, rawError?: unknown }>}
 */
export function sendMerchantSilentDashboardSync(deviceToken, data = {}) {
  const prov = getMerchantProvider();
  if (!prov) {
    return Promise.resolve({ sent: false, error: merchantError ?? "APNs app commerçant non configuré" });
  }
  const bundleId = (process.env.MERCHANT_APP_BUNDLE_ID ?? "com.myfidpass").trim();
  /** @type {Record<string, string>} */
  const payloadData = { myfidpass_action: "dashboard_sync", ...data };
  for (const k of Object.keys(payloadData)) {
    const v = payloadData[k];
    if (v != null && typeof v !== "string") {
      payloadData[k] = String(v);
    }
  }
  const note = new SilentNotification(deviceToken, {
    topic: bundleId,
    expiration: Math.floor(Date.now() / 1000) + 3600,
    collapseId: "mfp-merchant-dash-sync",
    data: payloadData,
  });

  return prov.send(note).then(
    () => ({ sent: true }),
    (err) => {
      if (isConnectionLevelError(err)) {
        merchantProvider = undefined;
      }
      return { sent: false, error: String(err?.reason ?? err?.message ?? err), rawError: err };
    }
  );
}

// ——— Status / shutdown ———

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
