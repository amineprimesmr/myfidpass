/**
 * Google Wallet — génération du lien "Add to Google Wallet" pour les cartes de fidélité.
 * Même logique que le pass Apple : barcode PDF_417 avec member.id pour le scan en caisse.
 */

import jwt from "jsonwebtoken";
import { GoogleAuth } from "google-auth-library";
import { getMembersForBusiness } from "./db/members.js";
import { stampNextRewardFaceLabelAndValue } from "./pass/stamp-next-reward-face.js";
import { normalizeStampBalance } from "./lib/stamps-cycle-math.js";

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

function googleWalletObjectIdsForMember(issuerId, member, business) {
  const ids = [getBusinessObjectId(issuerId, member, business), getLegacyObjectId(issuerId, member)];
  return [...new Set(ids.filter(Boolean))];
}

function truncateGoogleText(value, max) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1)).trim()}…` : clean;
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

function publicStampHeroUrlForBusiness(apiBase, business, filled = 0) {
  const slug = business?.slug ? encodeURIComponent(String(business.slug)) : "";
  const base = String(apiBase || "https://api.myfidpass.fr").replace(/\/$/, "");
  if (!slug) return null;
  const programType = String(business?.program_type || "").toLowerCase();
  if (programType !== "stamps") return null;
  const f = Math.max(0, Math.min(10, Math.floor(Number(filled) || 0)));
  const stampVersion = [business?.updated_at, business?.stamp_emoji]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join("_");
  const vParam = stampVersion ? `&v=${encodeURIComponent(stampVersion).slice(0, 80)}` : "";
  return `${base}/api/businesses/${slug}/public/wallet-stamp-hero?filled=${f}${vParam}`;
}

function publicCardBackgroundUrlForBusiness(apiBase, business) {
  const slug = business?.slug ? encodeURIComponent(String(business.slug)) : "";
  const base = String(apiBase || "https://api.myfidpass.fr").replace(/\/$/, "");
  if (!slug || !hasBusinessAsset(business, "card_background")) return null;
  return `${base}/api/businesses/${slug}/public/wallet-card-background${imageVersionParam(business?.card_background_updated_at || business?.updated_at)}`;
}

function publicHeroImageUrlForBusiness(apiBase, business, filledStamps = 0) {
  const bg = publicCardBackgroundUrlForBusiness(apiBase, business);
  if (bg) return bg;
  return publicStampHeroUrlForBusiness(apiBase, business, filledStamps);
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
  return fullRewardsListForBusiness(business, programType);
}

function fullRewardsListForBusiness(business, programType) {
  if (programType === "stamps") {
    const required = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
    const start = String(business?.start_game_reward_label || "").trim();
    const mid = String(business?.stamp_mid_reward_label || "").trim();
    const finalLabel = String(business?.stamp_reward_label || "").trim() || "Récompense";
    const lines = [];
    if (start) lines.push(`10 tampons : ${start}`);
    if (required > 5 && mid) lines.push(`5 tampons : ${mid}`);
    lines.push(`${required} tampons : ${finalLabel}`);
    return truncateGoogleText(lines.join(" · "), 500);
  }
  const start = String(business?.start_game_reward_label || "").trim();
  const lines = [];
  if (start) lines.push(`10 pts : ${start}`);
  const tiers = parseRewardTiers(business?.points_reward_tiers)
    .map((tier) => ({
      points: Math.max(0, Math.floor(Number(tier?.points) || 0)),
      label: String(tier?.label || tier?.reward || tier?.name || "").trim(),
    }))
    .filter((tier) => tier.points > 0 && tier.label)
    .sort((a, b) => a.points - b.points);
  for (const tier of tiers) {
    lines.push(`${tier.points} pts : ${tier.label}`);
  }
  if (!lines.length) return "Récompenses selon le barème du commerce";
  return truncateGoogleText(lines.join(" · "), 500);
}

function nextPointsRewardForBalance(business, balance) {
  const tiers = parseRewardTiers(business?.points_reward_tiers)
    .map((tier) => ({
      points: Math.max(0, Math.floor(Number(tier?.points) || 0)),
      label: String(tier?.label || tier?.reward || tier?.name || "").trim(),
    }))
    .filter((tier) => tier.points > 0 && tier.label)
    .sort((a, b) => a.points - b.points);
  const next = tiers.find((tier) => balance < tier.points);
  if (!next) {
    const last = tiers[tiers.length - 1];
    return last
      ? { label: "Objectif atteint", value: last.label }
      : { label: "Récompense", value: "Barème du commerce" };
  }
  const need = next.points - balance;
  return {
    label: need === 1 ? "Dans 1 point" : `Dans ${need} points`,
    value: next.label,
  };
}

function loyaltyBalancesForMember(member, business, programType, apiBase) {
  const requiredStamps = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
  const currentBalance = Math.max(0, Math.floor(Number(member.points) || 0));

  if (programType === "stamps") {
    const filled = Math.min(currentBalance, requiredStamps);
    const next = stampNextRewardFaceLabelAndValue({
      stampsCollected: filled,
      totalStamps: requiredStamps,
      midReward: business?.stamp_mid_reward_label,
      finalReward: business?.stamp_reward_label,
    });
    return {
      loyaltyPoints: {
        label: "Tampons",
        balance: { int: filled },
      },
      secondaryLoyaltyPoints: {
        label: truncateGoogleText(next.label, 32),
        balance: { string: truncateGoogleText(next.value, 40) },
      },
      heroFilled: filled,
    };
  }

  const next = nextPointsRewardForBalance(business, currentBalance);
  return {
    loyaltyPoints: {
      label: "Points",
      balance: { int: currentBalance },
    },
    secondaryLoyaltyPoints: {
      label: truncateGoogleText(next.label, 32),
      balance: { string: truncateGoogleText(next.value, 40) },
    },
    heroFilled: 0,
  };
}

function buildLoyaltyClass(classId, business = null, apiBase = null) {
  const merchantName = displayNameForBusiness(business);
  const logoUrl = business ? publicLogoUrlForBusiness(apiBase, business) : DEFAULT_PROGRAM_LOGO_URL;
  const heroUrl = business ? publicHeroImageUrlForBusiness(apiBase, business, 0) : null;
  const programType = String(business?.program_type || "").toLowerCase() === "stamps" ? "stamps" : "points";
  const accountNameLabel = String(business?.label_member || "").trim() || "Client";
  const accountIdLabel = "Carte";
  const rewardsBody = business ? rewardSummaryForBusiness(business, programType) : "Récompenses fidélité";
  return {
    id: classId,
    issuerName: merchantName.slice(0, 20),
    programName: merchantName.slice(0, 50),
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: normalizeHexColor(business?.background_color, "#2563EB"),
    accountNameLabel: accountNameLabel.slice(0, 20),
    accountIdLabel,
    programLogo: googleImage(logoUrl, `Logo ${merchantName}`),
    ...(heroUrl ? { heroImage: googleImage(heroUrl, `Carte ${merchantName}`) } : {}),
    textModulesData: [
      {
        header: "Récompenses",
        body: truncateGoogleText(rewardsBody, 120),
        id: "rewards_summary",
      },
    ],
    homepageUri: {
      uri: business?.slug ? `https://myfidpass.fr/fidelity/${encodeURIComponent(String(business.slug))}` : "https://myfidpass.fr",
      description: "Carte fidélité",
    },
  };
}

function buildLoyaltyObject(objectId, classId, member, business, apiBase = null) {
  const programType = String(business?.program_type || "").toLowerCase() === "stamps" ? "stamps" : "points";
  const accountName = (member.name || member.email || "Client").slice(0, 20);
  const accountId = (member.email || member.id).slice(0, 20);
  const stampMax = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
  const stampBalanceForHero =
    programType === "stamps"
      ? normalizeStampBalance(member.points, stampMax)
      : Math.max(0, Math.floor(Number(member.points) || 0));
  const heroUrl = publicHeroImageUrlForBusiness(apiBase, business, stampBalanceForHero);
  const rewardsBody = fullRewardsListForBusiness(business, programType);
  const backTerms = String(business?.back_terms || "").trim();
  const backContact = String(business?.back_contact || "").trim();
  const textModules = [
    {
      header: "Récompenses",
      body: rewardsBody,
      id: "rewards_full",
    },
    {
      header: "Commerce",
      body: displayNameForBusiness(business),
      id: "merchant",
    },
    {
      header: "Scan",
      body: "Présentez le QR code en caisse pour créditer votre fidélité.",
      id: "scan_hint",
    },
  ];
  if (backTerms) {
    textModules.push({
      header: "Conditions",
      body: truncateGoogleText(backTerms, 500),
      id: "pass_back_terms",
    });
  }
  if (backContact) {
    textModules.push({
      header: "Contact",
      body: truncateGoogleText(backContact, 200),
      id: "pass_back_contact",
    });
  }
  return {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountName,
    accountId,
    barcode: {
      type: "QR_CODE",
      value: member.id,
      alternateText: member.id,
    },
    ...(heroUrl ? { heroImage: googleImage(heroUrl, `Carte ${displayNameForBusiness(business)}`) } : {}),
    textModulesData: textModules,
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
      changed((x) => x.accountNameLabel) ||
      changed((x) => x.textModulesData) ||
      changed((x) => x.homepageUri) ||
      Boolean(current.data?.classTemplateInfo) ||
      Boolean(current.data?.textModulesData?.length) ||
      Boolean(current.data?.imageModulesData?.length);
    let patched = false;
    let patchStatus = null;
    if (needsPatch) {
      const patchBody = { ...classDef, classTemplateInfo: {} };
      const patch = await googleWalletApiRequest(config, "PATCH", getPath, patchBody);
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
    const patchBody = {
      ...objectDef,
      loyaltyPoints: undefined,
      secondaryLoyaltyPoints: undefined,
    };
    delete patchBody.loyaltyPoints;
    delete patchBody.secondaryLoyaltyPoints;
    const patch = await googleWalletApiRequest(config, "PATCH", getPath, patchBody);
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

export async function syncGoogleWalletHeroForBusinessMembers(business, apiBase, { limit = 300 } = {}) {
  const config = getConfig();
  if (!config || !business?.id) {
    return { ok: false, configured: Boolean(config), synced: 0, skipped: true };
  }
  const programType = String(business?.program_type || "").toLowerCase();
  if (programType !== "stamps") {
    return { ok: true, configured: true, synced: 0, skipped: true };
  }
  const ensured = await ensureGoogleWalletClassForBusiness(business, apiBase);
  if (!ensured.ok) {
    return { ok: false, configured: true, synced: 0, error: ensured.error || "Google Wallet class unavailable" };
  }
  const { members } = getMembersForBusiness(business.id, { limit, offset: 0, sort: "created_desc" });
  let synced = 0;
  let failed = 0;
  for (const member of members) {
    const result = await ensureGoogleWalletObjectForMember(member, business, apiBase, ensured.classId);
    if (result.ok) synced++;
    else failed++;
    await syncLegacyGoogleWalletObjectForMember(config, member, business, apiBase);
  }
  return { ok: failed === 0, configured: true, synced, failed, total: members.length };
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

export async function addGoogleWalletNotificationMessageForMember(member, business, {
  title,
  body,
  batchId = null,
} = {}) {
  const config = getConfig();
  if (!config) return { ok: false, configured: false, sent: 0, skipped: 0, failed: 0, error: "Google Wallet non configuré" };

  const header = truncateGoogleText(title || displayNameForBusiness(business), 60);
  const messageBody = truncateGoogleText(body, 400);
  if (!messageBody) return { ok: false, configured: true, sent: 0, skipped: 0, failed: 0, error: "Message vide" };

  const objectIds = googleWalletObjectIdsForMember(config.issuerId, member, business);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const objectId of objectIds) {
    const getPath = `/loyaltyObject/${encodeURIComponent(objectId)}`;
    const current = await googleWalletApiRequest(config, "GET", getPath);
    if (current.status === 404) {
      skipped++;
      continue;
    }
    if (!current.ok) {
      failed++;
      errors.push({ objectId, status: current.status, error: current.data?.error || current.data });
      continue;
    }

    const messageIdSource = batchId || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const messageId = safeSuffix(`notif_${messageIdSource}_${member.id}`).slice(0, 120);
    const add = await googleWalletApiRequest(config, "POST", `${getPath}/addMessage`, {
      message: {
        id: messageId,
        header,
        body: messageBody,
        messageType: "TEXT_AND_NOTIFY",
      },
    });
    if (add.ok) {
      sent++;
      break;
    } else {
      failed++;
      errors.push({ objectId, status: add.status, error: add.data?.error || add.data });
    }
  }

  return {
    ok: failed === 0,
    configured: true,
    sent,
    skipped,
    failed,
    errors,
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
  const loyaltyObject = buildLoyaltyObject(objectId, classId, member, business, options.apiBase);

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
