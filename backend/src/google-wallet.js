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

function normalizeHexColor(value, fallback = "#2563EB") {
  const raw = String(value || "").trim();
  const withHash = raw ? (raw.startsWith("#") ? raw : `#${raw}`) : "";
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : fallback;
}

function displayNameForBusiness(business) {
  const raw = business?.organization_name || business?.name || "MyFidpass Fidélité";
  const clean = String(raw).trim();
  return clean || "MyFidpass Fidélité";
}

function getDefaultClassId(issuerId) {
  return process.env.GOOGLE_WALLET_CLASS_ID?.trim() || `${issuerId}.${DEFAULT_CLASS_SUFFIX}`;
}

function getBusinessClassId(issuerId, business) {
  if (process.env.GOOGLE_WALLET_CLASS_ID?.trim()) return process.env.GOOGLE_WALLET_CLASS_ID.trim();
  const suffixSource = business?.slug || business?.id || DEFAULT_CLASS_SUFFIX;
  return `${issuerId}.business_${safeSuffix(suffixSource).slice(0, 80)}`;
}

function publicLogoUrlForBusiness(apiBase, business) {
  const slug = business?.slug ? encodeURIComponent(String(business.slug)) : "";
  const base = String(apiBase || "https://api.myfidpass.fr").replace(/\/$/, "");
  if (!slug) return DEFAULT_PROGRAM_LOGO_URL;
  return `${base}/api/businesses/${slug}/public/logo`;
}

function buildLoyaltyClass(classId, business = null, apiBase = null) {
  const merchantName = displayNameForBusiness(business);
  return {
    id: classId,
    issuerName: merchantName.slice(0, 20),
    programName: merchantName.slice(0, 50),
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: normalizeHexColor(business?.background_color, "#2563EB"),
    programLogo: {
      sourceUri: {
        uri: business ? publicLogoUrlForBusiness(apiBase, business) : DEFAULT_PROGRAM_LOGO_URL,
      },
      contentDescription: { defaultValue: { language: "fr-FR", value: `Logo ${merchantName}` } },
    },
    homepageUri: {
      uri: business?.slug ? `https://myfidpass.fr/fidelity/${encodeURIComponent(String(business.slug))}` : "https://myfidpass.fr",
      description: "Carte fidélité",
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

async function ensureGoogleWalletClass(classDef, config) {
  const getPath = `/loyaltyClass/${encodeURIComponent(classDef.id)}`;
  const current = await googleWalletApiRequest(config, "GET", getPath);
  if (current.ok) {
    const currentLogo = current.data?.programLogo?.sourceUri?.uri || "";
    const nextLogo = classDef.programLogo?.sourceUri?.uri || "";
    const needsPatch =
      current.data?.programName !== classDef.programName ||
      current.data?.issuerName !== classDef.issuerName ||
      current.data?.hexBackgroundColor !== classDef.hexBackgroundColor ||
      currentLogo !== nextLogo;
    let patched = false;
    let patchStatus = null;
    if (needsPatch) {
      const patch = await googleWalletApiRequest(config, "PATCH", getPath, classDef);
      patched = patch.ok;
      patchStatus = patch.status;
    }
    return {
      ok: true,
      classId: classDef.id,
      exists: true,
      patched,
      patchStatus,
      reviewStatus: current.data?.reviewStatus,
      classState: current.data?.classState,
    };
  }
  if (current.status !== 404) {
    return {
      ok: false,
      classId: classDef.id,
      exists: false,
      googleStatus: current.status,
      googleError: current.data?.error || current.data,
    };
  }
  const inserted = await googleWalletApiRequest(config, "POST", "/loyaltyClass", classDef);
  return {
    ok: inserted.ok,
    classId: classDef.id,
    exists: inserted.ok,
    created: inserted.ok,
    reviewStatus: inserted.data?.reviewStatus,
    classState: inserted.data?.classState,
    googleStatus: inserted.status,
    googleError: inserted.ok ? undefined : (inserted.data?.error || inserted.data),
  };
}

export async function ensureGoogleWalletClassForDiagnostics() {
  const config = getConfig();
  if (!config) {
    return { ok: false, configured: false, error: "GOOGLE_WALLET_ISSUER_ID ou GOOGLE_WALLET_SERVICE_ACCOUNT_JSON invalide" };
  }
  const classId = getDefaultClassId(config.issuerId);
  const ensured = await ensureGoogleWalletClass(buildLoyaltyClass(classId), config);
  return {
    ...ensured,
    configured: true,
    serviceAccountEmail: config.clientEmail,
  };
}

export async function ensureGoogleWalletClassForBusiness(business, apiBase) {
  const config = getConfig();
  if (!config) return { ok: false, configured: false, error: "Google Wallet non configuré" };
  const classId = getBusinessClassId(config.issuerId, business);
  const ensured = await ensureGoogleWalletClass(buildLoyaltyClass(classId, business, apiBase), config);
  return {
    ...ensured,
    configured: true,
    serviceAccountEmail: config.clientEmail,
  };
}

/**
 * Génère l'URL "Add to Google Wallet" pour un membre.
 * @param {Object} member - { id, name, email, points }
 * @param {Object} business - { id, organization_name }
 * @param {string} frontendOrigin - origine autorisée (ex. https://myfidpass.fr)
 * @returns {{ url: string } | null }
 */
export function getGoogleWalletSaveUrl(member, business, frontendOrigin, options = {}) {
  const config = getConfig();
  if (!config) return null;

  const { issuerId, clientEmail, privateKey } = config;
  const configuredClassId = process.env.GOOGLE_WALLET_CLASS_ID?.trim();
  const classId = options.classId || getBusinessClassId(issuerId, business);
  const objectId = `${issuerId}.${safeSuffix(member.id)}`;

  const programType = String(business?.program_type || "").toLowerCase() === "stamps" ? "stamps" : "points";
  const balanceLabel = programType === "stamps" ? "Tampons" : "Points";
  const accountName = (member.name || member.email || "Client").slice(0, 20);
  const accountId = (member.email || member.id).slice(0, 20);

  const loyaltyClass = buildLoyaltyClass(classId, business, options.apiBase);

  const loyaltyObject = {
    id: objectId,
    classId: loyaltyClass.id,
    state: "ACTIVE",
    accountName,
    accountId,
    loyaltyPoints: {
      label: balanceLabel,
      balance: { int: Math.max(0, Math.floor(Number(member.points) || 0)) },
    },
    barcode: {
      type: "QR_CODE",
      value: member.id,
      alternateText: member.id,
    },
    textModulesData: [
      {
        header: "Commerce",
        body: displayNameForBusiness(business),
        id: "merchant",
      },
      {
        header: "Carte client",
        body: "Présentez le QR code en caisse pour créditer votre fidélité.",
        id: "scan_hint",
      },
    ],
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
      ...(configuredClassId || options.omitClass ? {} : { loyaltyClasses: [loyaltyClass] }),
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
