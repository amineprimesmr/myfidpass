/**
 * Google Wallet — génération du lien "Add to Google Wallet" pour les cartes de fidélité.
 * Même logique que le pass Apple : barcode PDF_417 avec member.id pour le scan en caisse.
 */

import jwt from "jsonwebtoken";
import { GoogleAuth } from "google-auth-library";

const GOOGLE_SAVE_BASE = "https://pay.google.com/gp/v/save";
const DEFAULT_CLASS_SUFFIX = "myfidpass_loyalty";
const DEFAULT_PROGRAM_LOGO_URL = "https://myfidpass.fr/assets/icone.png?v=20260416";

function getConfig() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON?.trim();
  if (!issuerId || !raw) return null;
  let key;
  try {
    key = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!key.client_email || !key.private_key) return null;
  const privateKey = String(key.private_key).replace(/\\n/g, "\n").trim();
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) return null;
  return { issuerId, clientEmail: key.client_email, privateKey, serviceAccountJson: { ...key, private_key: privateKey } };
}

/**
 * Construit un identifiant sûr pour Google (alphanumeric, ., _, -).
 */
function safeSuffix(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getClassId(issuerId) {
  return process.env.GOOGLE_WALLET_CLASS_ID?.trim() || `${issuerId}.${DEFAULT_CLASS_SUFFIX}`;
}

function buildLoyaltyClass(classId) {
  return {
    id: classId,
    issuerName: "Myfidpass",
    programName: "MyFidpass Fidélité",
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: "#2563EB",
    programLogo: {
      sourceUri: {
        uri: DEFAULT_PROGRAM_LOGO_URL,
      },
      contentDescription: { defaultValue: { language: "fr-FR", value: "Logo MyFidpass" } },
    },
  };
}

async function googleWalletAccessToken(config) {
  const auth = new GoogleAuth({
    credentials: config.serviceAccountJson,
    scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return typeof token === "string" ? token : token?.token;
}

async function googleWalletApiRequest(config, method, path, body) {
  const accessToken = await googleWalletAccessToken(config);
  if (!accessToken) throw new Error("Google Wallet access token absent");
  const res = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function ensureGoogleWalletClassForDiagnostics() {
  const config = getConfig();
  if (!config) {
    return { ok: false, configured: false, error: "GOOGLE_WALLET_ISSUER_ID ou GOOGLE_WALLET_SERVICE_ACCOUNT_JSON invalide" };
  }
  const classId = getClassId(config.issuerId);
  const getPath = `/loyaltyClass/${encodeURIComponent(classId)}`;
  const current = await googleWalletApiRequest(config, "GET", getPath);
  if (current.ok) {
    return {
      ok: true,
      configured: true,
      classId,
      serviceAccountEmail: config.clientEmail,
      exists: true,
      reviewStatus: current.data?.reviewStatus,
      classState: current.data?.classState,
    };
  }
  if (current.status !== 404) {
    return {
      ok: false,
      configured: true,
      classId,
      serviceAccountEmail: config.clientEmail,
      exists: false,
      googleStatus: current.status,
      googleError: current.data?.error || current.data,
    };
  }
  const inserted = await googleWalletApiRequest(config, "POST", "/loyaltyClass", buildLoyaltyClass(classId));
  return {
    ok: inserted.ok,
    configured: true,
    classId,
    serviceAccountEmail: config.clientEmail,
    exists: inserted.ok,
    created: inserted.ok,
    reviewStatus: inserted.data?.reviewStatus,
    classState: inserted.data?.classState,
    googleStatus: inserted.status,
    googleError: inserted.ok ? undefined : (inserted.data?.error || inserted.data),
  };
}

/**
 * Génère l'URL "Add to Google Wallet" pour un membre.
 * @param {Object} member - { id, name, email, points }
 * @param {Object} business - { id, organization_name }
 * @param {string} frontendOrigin - origine autorisée (ex. https://myfidpass.fr)
 * @returns {{ url: string } | null }
 */
export function getGoogleWalletSaveUrl(member, business, frontendOrigin) {
  const config = getConfig();
  if (!config) return null;

  const { issuerId, clientEmail, privateKey } = config;
  // Une classe Google Wallet doit être approuvée par Google. Ne pas en créer une par commerce :
  // une seule classe MyFidpass approuvée permet ensuite d'émettre les objets clients.
  const configuredClassId = process.env.GOOGLE_WALLET_CLASS_ID?.trim();
  const classId = getClassId(issuerId);
  const objectId = `${issuerId}.${safeSuffix(member.id)}`;

  const programName = "MyFidpass Fidélité";
  const accountName = (member.name || member.email || "Client").slice(0, 20);
  const accountId = (member.email || member.id).slice(0, 20);

  const loyaltyClass = buildLoyaltyClass(classId);

  const loyaltyObject = {
    id: objectId,
    classId: loyaltyClass.id,
    state: "ACTIVE",
    accountName,
    accountId,
    loyaltyPoints: {
      label: "Points",
      balance: { int: Math.max(0, Math.floor(Number(member.points) || 0)) },
    },
    barcode: {
      type: "QR_CODE",
      value: member.id,
      alternateText: member.id,
    },
  };

  const origins = [];
  if (frontendOrigin) origins.push(frontendOrigin.replace(/\/$/, ""));
  if (!origins.length) origins.push("https://myfidpass.fr");

  const payload = {
    iss: clientEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins,
    payload: {
      ...(configuredClassId ? {} : { loyaltyClasses: [loyaltyClass] }),
      loyaltyObjects: [loyaltyObject],
    },
  };

  try {
    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
    return { url: `${GOOGLE_SAVE_BASE}/${token}` };
  } catch (err) {
    console.error("Google Wallet JWT sign error:", err?.message);
    return null;
  }
}

export function isGoogleWalletConfigured() {
  return getConfig() !== null;
}
