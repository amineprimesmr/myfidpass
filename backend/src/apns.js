/**
 * Envoi de notifications APNs pour mise à jour des passes Apple Wallet
 * et alertes push sur l'app iOS commerçant.
 *
 * Utilise HTTP/2 natif pour PassKit Wallet et apns2@12 pour l'app iOS commerçant.
 *
 * IMPORTANT PassKit Wallet :
 * Apple documente les mises à jour Wallet comme un push APNs envoyé avec le certificat
 * du Pass Type ID (le même certificat que celui qui signe le .pkpass) et un payload JSON
 * vide `{}`. Ce n'est pas un silent push d'app avec `aps.content-available`.
 *
 * Variables d'environnement requises pour les push Wallet :
 *   SIGNER_CERT_PEM_BASE64 / SIGNER_KEY_PEM_BASE64, ou SIGNER_CERT_PEM / SIGNER_KEY_PEM
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
import { ApnsClient, Notification, SilentNotification, PushType, Priority } from "apns2";
import logger from "./lib/logger.js";
import { connect as http2Connect } from "node:http2";
import { createSecureContext } from "node:tls";
import { loadCertificates } from "./pass/certs.js";

const APNS_BUILD = "2026-05-28-passkit-cert-empty-payload";

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

// ——— PassKit provider (certificat Pass Type ID + payload vide) ———

let passkitProvider = undefined; // undefined = pas encore initialisé, null = échec
let passkitError = null;
let passkitSession = null;
let passkitSessionKey = null;

function loadPasskitCertificateCredentials() {
  try {
    const certs = loadCertificates();
    const passTypeId = (process.env.PASS_TYPE_ID ?? "").trim();
    if (!passTypeId) {
      return { ok: false, error: "PASS_TYPE_ID manquant. Définis-le sur Railway (ex. pass.com.tonentreprise.fidelity)." };
    }
    if (!certs?.signerCert || !certs?.signerKey) {
      return {
        ok: false,
        error:
          "Certificat PassKit manquant. Les push Wallet doivent utiliser SIGNER_CERT_PEM_BASE64 et SIGNER_KEY_PEM_BASE64 (certificat du Pass Type ID).",
      };
    }
    createSecureContext({
      cert: certs.signerCert,
      key: certs.signerKey,
      passphrase: certs.signerKeyPassphrase,
    });
    return {
      ok: true,
      passTypeId,
      cert: certs.signerCert,
      key: certs.signerKey,
      passphrase: certs.signerKeyPassphrase,
    };
  } catch (err) {
    return { ok: false, error: `Certificat PassKit/APNs invalide : ${err?.message ?? String(err)}` };
  }
}

function getPasskitProvider() {
  if (passkitProvider !== undefined) return passkitProvider;
  passkitError = null;
  const creds = loadPasskitCertificateCredentials();
  if (!creds.ok) {
    passkitError = creds.error;
    passkitProvider = null;
    return null;
  }
  passkitProvider = creds;
  logger.debug({ passTypeId: creds.passTypeId, host: apnsHost() }, "[apns] PassKit provider certificat prêt");
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
  const passkitCreds = loadPasskitCertificateCredentials();
  const reason = getApnsUnavailableReason();
  const raw = normalizeApnsP8String(process.env.APNS_KEY_P8);
  return {
    ok: !reason,
    build: APNS_BUILD,
    host: apnsHost(),
    passTypeIdPresent: !!(process.env.PASS_TYPE_ID ?? "").trim(),
    passkitAuth: "certificate",
    passkitCertificateReady: !!passkitCreds.ok,
    passkitCertificateReason: passkitCreds.ok ? undefined : passkitCreds.error,
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

function getPasskitHttp2Session(creds) {
  const host = apnsHost();
  const key = `${host}:${creds.passTypeId}`;
  if (passkitSession && !passkitSession.closed && !passkitSession.destroyed && passkitSessionKey === key) {
    return passkitSession;
  }
  if (passkitSession && !passkitSession.destroyed) {
    try {
      passkitSession.close();
    } catch (_) {}
  }
  passkitSessionKey = key;
  passkitSession = http2Connect(`https://${host}`, {
    cert: creds.cert,
    key: creds.key,
    passphrase: creds.passphrase,
    ALPNProtocols: ["h2"],
  });
  passkitSession.on("error", (err) => {
    logger.warn({ errMsg: err?.message }, "[apns] PassKit session HTTP/2 erreur — reset");
    passkitSession = null;
    passkitSessionKey = null;
  });
  passkitSession.on("close", () => {
    passkitSession = null;
    passkitSessionKey = null;
  });
  return passkitSession;
}

/**
 * Envoie une notification "pass mis à jour" (payload vide) à un device Apple Wallet.
 *
 * @param {string} deviceToken
 * @param {{ collapseId?: string | null }} [opts]
 *   - collapseId est accepté pour compatibilité d'appel, mais volontairement ignoré pour PassKit.
 *     Apple documente le push Wallet comme une simple invalidation : le payload ne transporte
 *     aucune donnée métier et les pushes peuvent être coalescés sans perte, parce que l'iPhone
 *     récupère ensuite la liste des serialNumbers changés via `passesUpdatedSince`.
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export function sendPassKitUpdate(deviceToken, opts = {}) {
  void opts;
  const creds = getPasskitProvider();
  if (!creds) {
    return Promise.resolve({ sent: false, error: passkitError ?? "APNs non configuré" });
  }

  const tokenTail = deviceToken.slice(-8);
  logger.info(
    {
      deviceToken: tokenTail,
      passTypeId: creds.passTypeId,
      auth: "certificate",
      payload: "{}",
    },
    "[apns] PassKit → envoi push Wallet certificat payload vide"
  );

  const sendPromise = new Promise((resolve) => {
    let session;
    try {
      session = getPasskitHttp2Session(creds);
    } catch (err) {
      passkitSession = null;
      passkitSessionKey = null;
      resolve({ sent: false, error: err?.message ?? String(err) });
      return;
    }

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": creds.passTypeId,
      "apns-push-type": "background",
      "apns-priority": "5",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
    });
    let statusCode = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      statusCode = Number(headers[":status"]) || 0;
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (statusCode >= 200 && statusCode < 300) {
        logger.info({ deviceToken: tokenTail, statusCode }, "[apns] PassKit push ACK par APNs");
        resolve({ sent: true });
        return;
      }
      let reason = body || `APNs HTTP ${statusCode || "unknown"}`;
      try {
        const parsed = body ? JSON.parse(body) : null;
        if (parsed?.reason) reason = parsed.reason;
      } catch (_) {}
      logger.warn({ reason, statusCode, deviceToken: tokenTail }, "[apns] PassKit push REFUSÉ par APNs");
      resolve({ sent: false, error: reason });
    });
    req.on("error", (err) => {
      passkitSession = null;
      passkitSessionKey = null;
      logger.warn({ errMsg: err?.message }, "[apns] PassKit push erreur HTTP/2");
      resolve({ sent: false, error: err?.message ?? String(err) });
    });
    req.end("{}");
  });
  return withTimeout(sendPromise, PASSKIT_TIMEOUT_MS, "PassKit APNs").catch((err) => {
    logger.warn("[apns] Timeout APNs PassKit — session recyclée");
    passkitSession = null;
    passkitSessionKey = null;
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
    // mutable-content = 1 permet à la Notification Service Extension de joindre l'icône
    if (typeof payload.data.notification_icon_url === "string" && payload.data.notification_icon_url) {
      opts.mutableContent = true;
    }
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
    logger.info({ build: APNS_BUILD, auth: "certificate" }, "[apns] PassKit APNs prêt (certificat Pass Type ID OK)");
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
  if (passkitSession && !passkitSession.destroyed) {
    passkitSession.close();
    passkitSession = null;
    passkitSessionKey = null;
  }
  if (passkitProvider) {
    passkitProvider = null;
  }
  if (merchantProvider) {
    await merchantProvider.destroy().catch(() => {});
    merchantProvider = null;
  }
}
