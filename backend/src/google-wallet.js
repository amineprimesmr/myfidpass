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

export function getGoogleWalletDefaultClassId() {
  const config = getConfig();
  if (!config) return null;
  return getDefaultClassId(config.issuerId);
}

function getBusinessClassId(issuerId, business) {
  if (process.env.GOOGLE_WALLET_CLASS_ID?.trim()) return process.env.GOOGLE_WALLET_CLASS_ID.trim();
  const suffixSource = business?.slug || business?.id || DEFAULT_CLASS_SUFFIX;
  return `${issuerId}.business_${safeSuffix(suffixSource).slice(0, 80)}`;
}

function getLegacyObjectId(issuerId, member) {
  return `${issuerId}.${safeSuffix(member.id)}`;
}

function getBusinessObjectId(issuerId, member, business) {
  const businessSuffix = safeSuffix(business?.slug || business?.id || "business").slice(0, 48);
  const memberSuffix = safeSuffix(member.id).slice(0, 96);
  return `${issuerId}.business_${businessSuffix}_${memberSuffix}`;
}

function imageVersionParam(value) {
  const raw = String(value || "").trim();
  return raw ? `?v=${encodeURIComponent(raw).slice(0, 80)}` : "";
}

function publicLogoUrlForBusiness(apiBase, business) {
  const slug = business?.slug ? encodeURIComponent(String(business.slug)) : "";
  const base = String(apiBase || "https://api.myfidpass.fr").replace(/\/$/, "");
  if (!slug) return DEFAULT_PROGRAM_LOGO_URL;
  return `${base}/api/businesses/${slug}/public/logo${imageVersionParam(business?.logo_updated_at || business?.updated_at)}`;
}

function publicHeroImageUrlForBusiness(apiBase, business) {
  const slug = business?.slug ? encodeURIComponent(String(business.slug)) : "";
  const base = String(apiBase || "https://api.myfidpass.fr").replace(/\/$/, "");
  if (!slug || !hasBusinessAsset(business, "card_background")) return null;
  return `${base}/api/businesses/${slug}/public/wallet-card-background${imageVersionParam(business?.card_background_updated_at || business?.updated_at)}`;
}

function publicStampIconUrlForBusiness(apiBase, business) {
  const slug = business?.slug ? encodeURIComponent(String(business.slug)) : "";
  const base = String(apiBase || "https://api.myfidpass.fr").replace(/\/$/, "");
  if (!slug || !hasBusinessAsset(business, "stamp_icon")) return null;
  return `${base}/api/businesses/${slug}/public/stamp-icon${imageVersionParam(business?.logo_updated_at || business?.updated_at)}`;
}

function hasBusinessAsset(business, key) {
  if (key === "card_background") {
    return Number(business?.asset_card_background_present) === 1 || Boolean(String(business?.card_background_base64 || "").trim());
  }
  if (key === "stamp_icon") {
    return Number(business?.asset_stamp_icon_present) === 1 || Boolean(String(business?.stamp_icon_base64 || "").trim());
  }
  return false;
}

function localizedString(value, language = "fr-FR") {
  return { defaultValue: { language, value } };
}

function googleImage(uri, description) {
  return {
    sourceUri: { uri },
    contentDescription: localizedString(description),
  };
}

function parseRewardTiers(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rewardSummaryForBusiness(business, programType) {
  if (programType === "stamps") {
    const required = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
    const label = String(business?.stamp_reward_label || "").trim() || "Récompense";
    return `${label} à ${required} tampons`;
  }
  const tiers = parseRewardTiers(business?.points_reward_tiers);
  const firstTier = tiers
    .map((tier) => ({
      points: Math.max(0, Math.floor(Number(tier?.points) || 0)),
      label: String(tier?.label || tier?.reward || tier?.name || "").trim(),
    }))
    .filter((tier) => tier.points > 0)
    .sort((a, b) => a.points - b.points)[0];
  if (!firstTier) return "Récompenses selon le barème du commerce";
  return `${firstTier.label || "Récompense"} à ${firstTier.points} points`;
}

function cardTemplateInfo(includeStampIcon) {
  const balanceField = { fieldPath: "object.textModulesData['balance']" };
  const rewardField = { fieldPath: "object.textModulesData['reward']" };
  const merchantField = { fieldPath: "class.textModulesData['merchant']" };
  const template = {
    cardTemplateOverride: {
      cardRowTemplateInfos: [
        {
          twoItems: {
            startItem: { firstValue: { fields: [balanceField] } },
            endItem: { firstValue: { fields: [rewardField] } },
          },
        },
        {
          oneItem: {
            item: { firstValue: { fields: [merchantField] } },
          },
        },
      ],
    },
    listTemplateOverride: {
      firstRowOption: {
        fieldOption: { fields: [{ fieldPath: "class.textModulesData['merchant']" }] },
      },
      secondRowOption: {
        fields: [{ fieldPath: "object.textModulesData['balance']" }],
      },
    },
  };
  if (includeStampIcon) {
    template.detailsTemplateOverride = {
      detailsItemInfos: [
        {
          item: {
            firstValue: {
              fields: [{ fieldPath: "class.imageModulesData['stamp_icon']" }],
            },
          },
        },
      ],
    };
  }
  return template;
}

function buildLoyaltyClass(classId, business = null, apiBase = null) {
  const merchantName = displayNameForBusiness(business);
  const logoUrl = business ? publicLogoUrlForBusiness(apiBase, business) : DEFAULT_PROGRAM_LOGO_URL;
  const heroUrl = business ? publicHeroImageUrlForBusiness(apiBase, business) : null;
  const stampIconUrl = business ? publicStampIconUrlForBusiness(apiBase, business) : null;
  const programType = String(business?.program_type || "").toLowerCase() === "stamps" ? "stamps" : "points";
  const pointsLabel = programType === "stamps" ? "Tampons" : "Points";
  const rewardSummary = rewardSummaryForBusiness(business, programType);
  return {
    id: classId,
    issuerName: merchantName.slice(0, 20),
    programName: merchantName.slice(0, 50),
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: normalizeHexColor(business?.background_color, "#2563EB"),
    accountNameLabel: "Client",
    accountIdLabel: "Carte",
    programLogo: googleImage(logoUrl, `Logo ${merchantName}`),
    ...(heroUrl ? { heroImage: googleImage(heroUrl, `Carte ${merchantName}`) } : {}),
    textModulesData: [
      { id: "merchant", header: "Commerce", body: merchantName },
      { id: "balance", header: pointsLabel, body: `Solde ${pointsLabel.toLowerCase()}` },
      { id: "reward", header: "Récompense", body: rewardSummary },
    ],
    ...(stampIconUrl
      ? { imageModulesData: [{ id: "stamp_icon", mainImage: googleImage(stampIconUrl, `Icône tampon ${merchantName}`) }] }
      : {}),
    classTemplateInfo: cardTemplateInfo(Boolean(stampIconUrl)),
    homepageUri: {
      uri: business?.slug ? `https://myfidpass.fr/fidelity/${encodeURIComponent(String(business.slug))}` : "https://myfidpass.fr",
      description: "Carte fidélité",
    },
  };
}

function buildLoyaltyObject(objectId, classId, member, business, apiBase = null) {
  const programType = String(business?.program_type || "").toLowerCase() === "stamps" ? "stamps" : "points";
  const balanceLabel = programType === "stamps" ? "Tampons" : "Points";
  const rewardSummary = rewardSummaryForBusiness(business, programType);
  const requiredStamps = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
  const currentBalance = Math.max(0, Math.floor(Number(member.points) || 0));
  const accountName = (member.name || member.email || "Client").slice(0, 20);
  const accountId = (member.email || member.id).slice(0, 20);
  const loyaltyClass = buildLoyaltyClass(classId, business, apiBase);
  return {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountName,
    accountId,
    loyaltyPoints: {
      label: balanceLabel,
      balance: { int: currentBalance },
    },
    secondaryLoyaltyPoints: {
      label: programType === "stamps" ? "Objectif" : "Récompense",
      balance: { string: programType === "stamps" ? `${requiredStamps} tampons` : rewardSummary },
    },
    barcode: {
      type: "QR_CODE",
      value: member.id,
      alternateText: member.id,
    },
    ...(loyaltyClass.heroImage ? { heroImage: loyaltyClass.heroImage } : {}),
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
      {
        header: balanceLabel,
        body: programType === "stamps" ? `${currentBalance}/${requiredStamps} tampons` : `${currentBalance} points`,
        id: "balance",
      },
      {
        header: programType === "stamps" ? "Récompense tampons" : "Récompense points",
        body: rewardSummary,
        id: "reward",
      },
    ],
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
    const changed = (path) => JSON.stringify(path(current.data) ?? null) !== JSON.stringify(path(classDef) ?? null);
    const needsPatch =
      changed((x) => x.programName) ||
      changed((x) => x.issuerName) ||
      changed((x) => x.hexBackgroundColor) ||
      changed((x) => x.programLogo) ||
      changed((x) => x.heroImage) ||
      changed((x) => x.textModulesData) ||
      changed((x) => x.imageModulesData) ||
      changed((x) => x.classTemplateInfo) ||
      changed((x) => x.homepageUri);
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

export async function ensureGoogleWalletObjectForMember(member, business, apiBase, classId) {
  const config = getConfig();
  if (!config) return { ok: false, configured: false, error: "Google Wallet non configuré" };
  const objectId = getBusinessObjectId(config.issuerId, member, business);
  const objectDef = buildLoyaltyObject(objectId, classId, member, business, apiBase);
  const getPath = `/loyaltyObject/${encodeURIComponent(objectId)}`;
  const current = await googleWalletApiRequest(config, "GET", getPath);
  if (current.ok) {
    const patch = await googleWalletApiRequest(config, "PATCH", getPath, objectDef);
    return {
      ok: patch.ok,
      configured: true,
      objectId,
      classId,
      exists: true,
      patched: patch.ok,
      googleStatus: patch.status,
      googleError: patch.ok ? undefined : (patch.data?.error || patch.data),
    };
  }
  if (current.status !== 404) {
    return {
      ok: false,
      configured: true,
      objectId,
      classId,
      exists: false,
      googleStatus: current.status,
      googleError: current.data?.error || current.data,
    };
  }
  const inserted = await googleWalletApiRequest(config, "POST", "/loyaltyObject", objectDef);
  return {
    ok: inserted.ok,
    configured: true,
    objectId,
    classId,
    exists: inserted.ok,
    created: inserted.ok,
    googleStatus: inserted.status,
    googleError: inserted.ok ? undefined : (inserted.data?.error || inserted.data),
  };
}

async function syncLegacyGoogleWalletObjectForMember(config, member, business, apiBase) {
  const objectId = getLegacyObjectId(config.issuerId, member);
  const businessObjectId = getBusinessObjectId(config.issuerId, member, business);
  if (objectId === businessObjectId) return { ok: true, skipped: true };

  const getPath = `/loyaltyObject/${encodeURIComponent(objectId)}`;
  const current = await googleWalletApiRequest(config, "GET", getPath);
  if (current.status === 404) return { ok: true, skipped: true, exists: false, objectId };
  if (!current.ok) {
    return {
      ok: false,
      exists: false,
      objectId,
      googleStatus: current.status,
      googleError: current.data?.error || current.data,
    };
  }

  const legacyClassId = current.data?.classId || getDefaultClassId(config.issuerId);
  const objectDef = buildLoyaltyObject(objectId, legacyClassId, member, business, apiBase);
  const patch = await googleWalletApiRequest(config, "PATCH", getPath, objectDef);
  return {
    ok: patch.ok,
    exists: true,
    objectId,
    classId: legacyClassId,
    patched: patch.ok,
    googleStatus: patch.status,
    googleError: patch.ok ? undefined : (patch.data?.error || patch.data),
  };
}

export async function syncGoogleWalletObjectForMember(member, business, apiBase) {
  const config = getConfig();
  if (!config) return { ok: false, configured: false, error: "Google Wallet non configuré" };
  const ensured = await ensureGoogleWalletClassForBusiness(business, apiBase);
  const classId = ensured.ok ? ensured.classId : getGoogleWalletDefaultClassId();
  if (!classId) {
    return {
      ok: false,
      classReady: ensured,
      error: "Google Wallet class unavailable",
    };
  }
  const objectReady = await ensureGoogleWalletObjectForMember(member, business, apiBase, classId);
  const legacyObjectReady = await syncLegacyGoogleWalletObjectForMember(config, member, business, apiBase);
  return {
    ok: objectReady.ok && legacyObjectReady.ok,
    classReady: ensured,
    objectReady,
    legacyObjectReady,
    classId,
    objectId: objectReady.objectId,
    googleStatus: objectReady.googleStatus || legacyObjectReady.googleStatus,
    googleError: objectReady.googleError || legacyObjectReady.googleError,
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
  const objectId = options.objectId || getBusinessObjectId(issuerId, member, business);
  const loyaltyClass = buildLoyaltyClass(classId, business, options.apiBase);
  const loyaltyObject = options.existingObject
    ? { id: objectId, classId }
    : buildLoyaltyObject(objectId, classId, member, business, options.apiBase);

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
