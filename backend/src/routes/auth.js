import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, createPublicKey } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { getUserIdByReferralCode, recordReferral } from "../db/referrals.js";
import {
  createUser,
  createUserWithPhone,
  getUserByEmail,
  getUserByPhoneE164,
  getUserById,
  getUserByAppleSub,
  setUserAppleSub,
  getUserByStaffLogin,
  getUsersByStaffLogin,
  normalizeStaffLogin,
  isReservedStaffEmailOnly,
  getBusinessesByUserId,
  getBusinessesForUserId,
  getSubscriptionByUserId,
  hasActiveSubscription,
  hasOperationalMerchantAccess,
  getMerchantTrialEndsAtIso,
  setPasswordResetToken,
  getPasswordResetByToken,
  deletePasswordResetToken,
  updateUserPassword,
  deleteUserAccount,
  isUserAdmin,
  createBusiness,
  updateBusiness,
  getBusinessBySlug,
  canCreateBusiness,
  getMerchantBusinessEntitlements,
  getAnyBusinessLinkedToGooglePlaceId,
  createRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  cleanExpiredRefreshTokens,
} from "../db.js";
import {
  getWorkspaceRoleForUser,
  getFirstTeamBusinessOwnerId,
  isOnlyTeamUser,
} from "../db/business-team.js";
import {
  upsertPhoneOtpChallenge,
  getPhoneOtpChallenge,
  deletePhoneOtpChallenge,
  incrementPhoneOtpAttempts,
} from "../db/phone-otp.js";
import { normalizePhoneE164 } from "../lib/phone-e164.js";
import { sendSmsViaTwilio, isTwilioConfigured, friendlyTwilioSendError } from "../lib/sms-twilio.js";
import { requireAuth, getJwtSecret } from "../middleware/auth.js";
import { sendMail, isEmailConfigured } from "../email.js";
import { validate, schemas } from "../lib/validate.js";
import { syncPremiumFromRevenueCatAppUserId } from "../services/revenuecat-subscription-sync.js";
import { fetchGooglePlaceBusinessEnrichment } from "../lib/google-place-business-enrichment.js";
import { refreshGooglePlacesSnapshotFromPlaceId } from "../services/social-metrics-service.js";

const router = Router();

/**
 * Base URL publique de l’API (identique à celle utilisée par l’app pour `redirect_uri` OAuth).
 * Sur Railway/proxy, `req.protocol` est souvent `http` alors que le client appelle en `https` :
 * l’échange code→token Google exige le même `redirect_uri` que dans la requête d’autorisation.
 */
function getPublicApiBase(req) {
  const fromEnv = (process.env.API_URL || "").replace(/\/$/, "").trim();
  if (fromEnv) return fromEnv;
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim() || "https";
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  if (!host) return "";
  const scheme = proto === "http" || proto === "https" ? proto : "https";
  return `${scheme}://${host}`;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID || ""; // Client ID OAuth iOS pour l'app
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""; // Pour échange code → token (flow OAuth app)
// Web (Service ID) et/ou app native : le JWT iOS a `aud` = bundle ID (ex. com.myfidpass), le flux web = Services ID.
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.myfidpass";
const APPLE_JWT_AUDIENCES = [...new Set([APPLE_CLIENT_ID, APPLE_BUNDLE_ID].filter(Boolean))];
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
const SALT_ROUNDS = 10;
/** Date très lointaine : refresh en base sans expiration « métier » (nettoyage = logout / rotation / admin). */
const REFRESH_TOKEN_EXPIRES_AT_FAR_FUTURE = "2099-12-31T23:59:59.999Z";

/**
 * Paire sans expiration JWT (`exp` absent) + refresh stocké sans fenêtre courte.
 * Révocation : logout, suppression compte, rotation sur POST /auth/refresh, changement JWT_SECRET.
 */
function issueTokenPair(userId) {
  const uid = userId != null && userId !== "" ? String(userId) : userId;
  const accessToken = jwt.sign({ userId: uid }, getJwtSecret());
  const refreshToken = randomUUID() + "-" + randomUUID();
  createRefreshToken(uid, refreshToken, REFRESH_TOKEN_EXPIRES_AT_FAR_FUTURE);
  return { accessToken, refreshToken };
}

// Nettoyage des tokens expirés au démarrage
cleanExpiredRefreshTokens();

function authSubscriptionPayload(userId) {
  const subscription = getSubscriptionByUserId(userId);
  const entitlements = getMerchantBusinessEntitlements(userId);
  if (isOnlyTeamUser(userId)) {
    const ownerId = getFirstTeamBusinessOwnerId(userId);
    if (ownerId) {
      const ownerAccess = hasOperationalMerchantAccess(String(ownerId).trim());
      const paying = hasActiveSubscription(userId);
      return {
        subscription: subscription ? { status: subscription.status, plan_id: subscription.plan_id } : null,
        has_active_subscription: ownerAccess,
        entitlements,
        merchant_trial_ends_at: ownerAccess
          ? null
          : paying
            ? null
            : getMerchantTrialEndsAtIso(String(ownerId).trim()) ?? getMerchantTrialEndsAtIso(userId),
      };
    }
  }
  const paying = hasActiveSubscription(userId);
  return {
    subscription: subscription ? { status: subscription.status, plan_id: subscription.plan_id } : null,
    has_active_subscription: hasOperationalMerchantAccess(userId),
    entitlements,
    merchant_trial_ends_at: paying ? null : getMerchantTrialEndsAtIso(userId),
  };
}

function authUserPayload(user) {
  if (!user) return null;
  const base = {
    id: user.id,
    name: user.name,
    phone: user.phone_e164 ?? null,
    is_admin: isUserAdmin(user),
    workspace_role: getWorkspaceRoleForUser(user.id),
  };
  if (user.staff_login) {
    return {
      ...base,
      email: null,
      staff_login: user.staff_login,
    };
  }
  return {
    ...base,
    email: user.email,
    staff_login: null,
  };
}

function normalizeEstablishmentSelection(source = {}) {
  const primary = {
    googlePlaceId: String(
      source.google_place_id || source.googlePlaceId || source.place_id || source.placeId || ""
    ).trim(),
    establishmentName: String(
      source.establishment_name || source.establishmentName || ""
    ).trim(),
  };
  const rawList = Array.isArray(source?.establishments) ? source.establishments : [];
  const list = rawList
    .map((item) => ({
      googlePlaceId: String(
        item?.google_place_id || item?.googlePlaceId || item?.place_id || item?.placeId || ""
      ).trim(),
      establishmentName: String(
        item?.establishment_name || item?.establishmentName || ""
      ).trim(),
    }))
    .filter((item) => item.googlePlaceId && item.establishmentName);
  const merged = [];
  const seen = new Set();
  for (const item of [primary, ...list]) {
    if (!item?.googlePlaceId || !item?.establishmentName) continue;
    const key = item.googlePlaceId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return {
    ...primary,
    establishments: merged,
  };
}

function hasSelectedEstablishment(selection) {
  return !!(selection?.googlePlaceId && selection?.establishmentName);
}

function getMerchantBusinessState(userId) {
  const businesses = getBusinessesForUserId(userId);
  return {
    businesses,
    requires_business_setup: businesses.length === 0,
  };
}

function buildAuthSuccessPayload(user) {
  const businessState = getMerchantBusinessState(user.id);
  return {
    user: authUserPayload(user),
    ...businessState,
    ...authSubscriptionPayload(user.id),
  };
}

function respondMissingEstablishment(res) {
  return res.status(400).json({
    error: "Sélectionnez d'abord votre établissement avant de créer votre compte.",
    code: "missing_establishment",
  });
}

async function ensureInitialBusinessForUser(userId, selection) {
  const picks = Array.isArray(selection?.establishments) ? selection.establishments : [];
  if (picks.length === 0 && !hasSelectedEstablishment(selection)) return getMerchantBusinessState(userId);
  const targets = picks.length > 0 ? picks : [selection];
  for (const target of targets) {
    const beforeCount = getBusinessesByUserId(userId).length;
    const placeCreateResult = await tryCreateFirstBusinessFromGooglePlace(
      userId,
      target.googlePlaceId,
      target.establishmentName
    );
    if (placeCreateResult?.error) {
      return {
        ...getMerchantBusinessState(userId),
        setup_error_code: placeCreateResult.code || "business_setup_failed",
        setup_error_message: placeCreateResult.error,
      };
    }
    const businessesAfterPlace = getBusinessesByUserId(userId);
    if (businessesAfterPlace.length <= beforeCount) {
      await tryCreateFirstBusinessFromNameOnly(userId, target.establishmentName);
    }
  }
  return getMerchantBusinessState(userId);
}

function decodeAuthState(rawState) {
  if (!rawState) return null;
  const raw = String(rawState).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return { mode: raw };
  }
}

function registerSlugFromName(name) {
  let s = String(name || "commerce")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 48) || "commerce";
}

/**
 * Crée le 1er commerce à partir d'un lieu Google (inscription app, comme la sélection Places du site).
 * Enregistre toujours le `place_id` dans `engagement_rewards.google_review` dès qu'il est fourni.
 * L'API Places (détails) enrichit nom / adresse / coordonnées via `fetchGooglePlaceBusinessEnrichment` ;
 * sinon ou si l'appel échoue, le commerce est quand même créé avec le Place ID (pas de ressaisie commerçant).
 */
async function tryCreateFirstBusinessFromGooglePlace(userId, placeId, establishmentNameHint) {
  const pid = String(placeId || "").trim();
  if (!pid || !canCreateBusiness(userId)) return { ok: false };
  const linked = getAnyBusinessLinkedToGooglePlaceId(pid);
  if (linked) {
    return {
      ok: false,
      code: "business_place_already_linked",
      error: "Ce commerce est déjà utilisé. Connectez-vous au compte existant ou choisissez un autre commerce.",
    };
  }

  const { name, lat, lng, addr } = await fetchGooglePlaceBusinessEnrichment(pid, establishmentNameHint);

  try {
    let baseSlug = registerSlugFromName(name);
    let slug = baseSlug;
    let n = 0;
    while (getBusinessBySlug(slug)) {
      n += 1;
      slug = `${baseSlug}-${n}`.slice(0, 60);
    }
    const biz = createBusiness({
      name,
      slug,
      organizationName: name,
      userId,
    });
    /** Même Place ID que la recherche inscription → mission « avis Google » + lien writereview sans ressaisie commerçant. */
    const engagementFromPlace = {
      google_review: {
        enabled: true,
        points: 50,
        place_id: pid,
        require_approval: false,
        auto_verify_enabled: true,
      },
    };
    updateBusiness(biz.id, {
      location_lat: lat ?? null,
      location_lng: lng ?? null,
      location_address: addr,
      engagement_rewards: engagementFromPlace,
    });
    // Snapshot Places immédiat → données disponibles dès la 1ère ouverture de la page stats.
    const bizId = biz.id;
    setImmediate(() => { refreshGooglePlacesSnapshotFromPlaceId(bizId, pid).catch(() => {}); });
    return { ok: true };
  } catch (e) {
    console.error("[auth/register] tryCreateFirstBusinessFromGooglePlace:", e);
    return { ok: false, code: "business_setup_failed", error: "Impossible de créer l'établissement." };
  }
}

/**
 * Crée le 1er commerce à partir du nom seul (repli si Places indisponible ou échec place details).
 */
async function tryCreateFirstBusinessFromNameOnly(userId, establishmentName) {
  const name = String(establishmentName || "").trim();
  if (!name || !canCreateBusiness(userId)) return;
  try {
    let baseSlug = registerSlugFromName(name);
    let slug = baseSlug;
    let n = 0;
    while (getBusinessBySlug(slug)) {
      n += 1;
      slug = `${baseSlug}-${n}`.slice(0, 60);
    }
    createBusiness({
      name,
      slug,
      organizationName: name,
      userId,
    });
  } catch (e) {
    console.error("[auth/register] tryCreateFirstBusinessFromNameOnly:", e);
  }
}

const appleOneTimeCodes = new Map();
const APPLE_CODE_TTL_MS = 5 * 60 * 1000;
function cleanupAppleCodes() {
  const now = Date.now();
  for (const [code, data] of appleOneTimeCodes.entries()) {
    if (data.expiry < now) appleOneTimeCodes.delete(code);
  }
}

const googleClient = (GOOGLE_CLIENT_ID || GOOGLE_IOS_CLIENT_ID) ? new OAuth2Client(GOOGLE_CLIENT_ID || GOOGLE_IOS_CLIENT_ID) : null;
const googleOAuthClient = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) : null;
const GOOGLE_AUDIENCES = [GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID].filter(Boolean);

const APPLE_JWKS_URI = "https://appleid.apple.com/auth/keys";
let appleJwksCache = null;
let appleJwksCacheTime = 0;
const APPLE_JWKS_CACHE_MS = 600000;

async function getAppleSigningKeyPem(kid) {
  if (!appleJwksCache || Date.now() - appleJwksCacheTime > APPLE_JWKS_CACHE_MS) {
    const res = await fetch(APPLE_JWKS_URI);
    if (!res.ok) throw new Error("Impossible de récupérer les clés Apple");
    const body = await res.json();
    appleJwksCache = body.keys || [];
    appleJwksCacheTime = Date.now();
  }
  const jwk = appleJwksCache.find((k) => k.kid === kid);
  if (!jwk) throw new Error("Clé Apple introuvable pour kid=" + kid);
  const key = createPublicKey({ key: jwk, format: "jwk" });
  return key.export({ type: "spki", format: "pem" });
}

/**
 * POST /api/auth/check-email
 * Body: { email } — indique si un compte existe (flux e-mail en deux étapes côté app).
 */
router.post("/check-email", validate(schemas.checkEmail), (req, res) => {
  const emailNorm = req.body.email;
  const exists = !!getUserByEmail(emailNorm);
  return res.json({ account_exists: exists });
});

/**
 * POST /api/auth/check-identifier
 * Body: { identifier } — e-mail ou identifiant employé (sans @). L’app unifie l’étape « compte connu ? ».
 */
router.post("/check-identifier", validate(schemas.checkIdentifier), (req, res) => {
  const raw = String(req.body.identifier || "").trim();
  if (!raw) {
    return res.json({ account_exists: false, kind: null });
  }
  if (raw.includes("@")) {
    const exists = !!getUserByEmail(raw.toLowerCase());
    return res.json({ account_exists: exists, kind: "email" });
  }
  const n = normalizeStaffLogin(raw);
  if (!n) {
    return res.status(400).json({ error: "Identifiant invalide", code: "INVALID_STAFF_LOGIN" });
  }
  const exists = !!getUserByStaffLogin(n);
  return res.json({ account_exists: exists, kind: "staff" });
});

/**
 * POST /api/auth/register
 * Body: { email, password, name?, google_place_id? | googlePlaceId?, establishment_name? }
 * Si google_place_id est fourni et Places configuré, crée le premier commerce (nom + adresse Google).
 */
router.post("/register", validate(schemas.register), async (req, res) => {
  const body = req.body || {};
  const { email, password, name, referral_code } = body;
  const establishmentSelection = normalizeEstablishmentSelection(body);
  // email et password déjà validés et normalisés par Zod (register schema)
  const emailNorm = email; // déjà toLowerCase() par le schéma
  if (isReservedStaffEmailOnly(emailNorm)) {
    return res.status(400).json({ error: "Adresse e-mail non autorisée." });
  }
  if (getUserByEmail(emailNorm)) {
    return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
  }
  try {
    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
    const user = createUser({
      email: emailNorm,
      passwordHash,
      name: name ? String(name).trim() : null,
    });
    const businessState = await ensureInitialBusinessForUser(user.id, establishmentSelection);
    if (businessState.setup_error_code) {
      return res.status(409).json({
        error: businessState.setup_error_message || "Impossible de créer l'établissement.",
        code: businessState.setup_error_code,
      });
    }
    if (businessState.requires_business_setup) {
      return respondMissingEstablishment(res);
    }
    if (referral_code) {
      try {
        const refCode = String(referral_code).trim().toUpperCase();
        const referrerUserId = getUserIdByReferralCode(refCode);
        if (referrerUserId && referrerUserId !== user.id) {
          recordReferral(referrerUserId, user.id);
        }
      } catch (refErr) {
        console.warn("[auth/register] referral application failed:", refErr.message);
      }
    }
    const { accessToken, refreshToken } = issueTokenPair(user.id);
    res.status(201).json({
      ...buildAuthSuccessPayload(user),
      token: accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Erreur lors de la création du compte" });
  }
});

/**
 * POST /api/auth/login
 * Body: { login, password } ou **legacy** { email, password } — e-mail **ou** identifiant employé.
 */
router.post("/login", validate(schemas.loginWithIdentifier), async (req, res) => {
  const { login, password } = req.body || {};
  const raw = String(login).trim();
  let user;
  if (raw.includes("@")) {
    user = getUserByEmail(raw.toLowerCase());
  } else {
    const n = normalizeStaffLogin(raw);
    if (!n) {
      return res.status(400).json({
        error: "Identifiant invalide (employé : 3-32 caractères, a-z, 0-9, _ et -).",
        code: "INVALID_STAFF_LOGIN",
      });
    }
    const candidates = getUsersByStaffLogin(n);
    if (!candidates.length) {
      user = null;
    } else {
      user = null;
      for (const candidate of candidates) {
        // Autorise le même `staff_login` sur plusieurs commerces ; le mot de passe départage.
        const okCandidate = await bcrypt.compare(String(password), candidate.password_hash);
        if (okCandidate) {
          user = candidate;
          break;
        }
      }
      if (!user) {
        return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
      }
    }
  }
  if (!user) {
    return res.status(404).json({
      error: "Aucun compte associé. Créez un compte commerçant sur myfidpass.fr ou utilisez l’identifiant fourni par votre employeur.",
      code: "NO_ACCOUNT",
    });
  }
  if (raw.includes("@")) {
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
    }
  }
  const { accessToken, refreshToken } = issueTokenPair(user.id);
  res.json({
    ...buildAuthSuccessPayload(user),
    token: accessToken,
    refreshToken,
  });
});

/**
 * POST /api/auth/google
 * Body: { idToken } ou { credential } (Google renvoie credential)
 * Vérifie le token Google, crée ou récupère l'utilisateur, retourne le JWT.
 * Audience : GOOGLE_CLIENT_ID (web) et/ou GOOGLE_IOS_CLIENT_ID (app) selon .env.
 */
router.post("/google", async (req, res) => {
  // Clients iOS (JSONEncoder convertToSnakeCase) envoient `id_token` ; le web envoie souvent `idToken`.
  const idToken = req.body?.idToken || req.body?.id_token || req.body?.credential;
  const establishmentSelection = normalizeEstablishmentSelection(req.body || {});
  const authIntent = String(req.body?.auth_intent || req.body?.authIntent || "").trim().toLowerCase();
  if (!idToken || GOOGLE_AUDIENCES.length === 0 || !googleClient) {
    return res.status(400).json({ error: "Connexion Google non configurée ou token manquant" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: String(idToken),
      audience: GOOGLE_AUDIENCES.length === 1 ? GOOGLE_AUDIENCES[0] : GOOGLE_AUDIENCES,
    });
    const payload = ticket.getPayload();
    const email = (payload?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email non fourni par Google" });
    }
    let user = getUserByEmail(email);
    const isNewUser = !user;
    if (!isNewUser && (authIntent === "sign_up" || authIntent === "signup")) {
      return res.status(409).json({
        error: "Un compte existe déjà avec cet identifiant Google. Utilisez Se connecter.",
        code: "account_already_exists_social",
      });
    }
    if (isNewUser && !hasSelectedEstablishment(establishmentSelection)) {
      return respondMissingEstablishment(res);
    }
    if (!user) {
      // Création automatique d'un compte lors de la première connexion Google
      const displayNameRaw =
        (payload?.name && String(payload.name)) ||
        [payload?.given_name, payload?.family_name].filter(Boolean).join(" ");
      const displayName = displayNameRaw ? displayNameRaw.trim() : null;
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({
        email,
        passwordHash: oauthPlaceholder,
        name: displayName,
      });
    }
    if (isNewUser) {
      const businessState = await ensureInitialBusinessForUser(user.id, establishmentSelection);
      if (businessState.setup_error_code) {
        return res.status(409).json({
          error: businessState.setup_error_message || "Impossible de créer l'établissement.",
          code: businessState.setup_error_code,
        });
      }
      if (businessState.requires_business_setup) {
        return respondMissingEstablishment(res);
      }
    }
    const { accessToken, refreshToken } = issueTokenPair(user.id);
    return res.json({
      ...buildAuthSuccessPayload(user),
      token: accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error("Google auth error:", e);
    return res.status(401).json({ error: "Token Google invalide ou expiré" });
  }
});

/**
 * GET /api/auth/config
 * Retourne les infos nécessaires au client (ex: clientId Google pour OAuth).
 */
router.get("/config", (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
  });
});

/**
 * GET /api/auth/google-oauth-callback?code=xxx
 * Reçoit le redirect OAuth Google (app iOS), échange le code contre un id_token,
 * crée ou récupère l'utilisateur, redirige vers myfidpass://auth?token=JWT
 */
router.get("/google-oauth-callback", async (req, res) => {
  const code = req.query?.code;
  const apiBase = getPublicApiBase(req);
  const redirectApp = "myfidpass://auth";
  if (!code || !googleOAuthClient) {
    const err = !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET ? "config" : "no_code";
    return res.redirect(302, `${redirectApp}?error=${err}`);
  }
  const stateData = decodeAuthState(req.query?.state);
  try {
    const { tokens } = await googleOAuthClient.getToken({
      code: String(code),
      redirect_uri: `${apiBase}/api/auth/google-oauth-callback`,
    });
    const idToken = tokens?.id_token;
    if (!idToken || !googleClient) {
      return res.redirect(302, `${redirectApp}?error=no_token`);
    }
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCES.length === 1 ? GOOGLE_AUDIENCES[0] : GOOGLE_AUDIENCES,
    });
    const payload = ticket.getPayload();
    const email = (payload?.email || "").trim().toLowerCase();
    if (!email) {
      return res.redirect(302, `${redirectApp}?error=no_email`);
    }
    let user = getUserByEmail(email);
    const isNewUser = !user;
    const establishmentSelection = normalizeEstablishmentSelection(stateData || {});
    const authIntent = String(stateData?.mode || "").trim().toLowerCase();
    if (!isNewUser && (authIntent === "sign_up" || authIntent === "signup")) {
      return res.redirect(302, `${redirectApp}?error=account_exists`);
    }
    if (isNewUser && !hasSelectedEstablishment(establishmentSelection)) {
      return res.redirect(302, `${redirectApp}?error=missing_establishment`);
    }
    if (!user) {
      // Aligné sur POST /api/auth/google : première connexion OAuth → création du compte (l’app iOS n’utilise que ce flux).
      const displayNameRaw =
        (payload?.name && String(payload.name)) ||
        [payload?.given_name, payload?.family_name].filter(Boolean).join(" ");
      const displayName = displayNameRaw ? displayNameRaw.trim() : null;
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({
        email,
        passwordHash: oauthPlaceholder,
        name: displayName,
      });
    }
    if (isNewUser) {
      const businessState = await ensureInitialBusinessForUser(user.id, establishmentSelection);
      if (businessState.setup_error_code) {
        return res.redirect(302, `${redirectApp}?error=${businessState.setup_error_code}`);
      }
      if (businessState.requires_business_setup) {
        return res.redirect(302, `${redirectApp}?error=missing_establishment`);
      }
    }
    const { accessToken, refreshToken } = issueTokenPair(user.id);
    return res.redirect(302, `${redirectApp}?token=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`);
  } catch (e) {
    console.error("Google OAuth callback error:", e);
    return res.redirect(302, `${redirectApp}?error=invalid`);
  }
});

/**
 * POST /api/auth/apple
 * Body: { idToken, name?, email? } — name/email optionnels (première auth Apple peut les envoyer côté client)
 * Vérifie le token Apple (JWKS), crée ou récupère l'utilisateur, retourne le JWT.
 */
router.post("/apple", async (req, res) => {
  const body = req.body || {};
  const rawToken = body.idToken || body.id_token;
  const bodyName = body.name;
  const bodyEmail = body.email;
  const establishmentSelection = normalizeEstablishmentSelection(body);
  const authIntent = String(body.auth_intent || body.authIntent || "").trim().toLowerCase();
  if (!rawToken || APPLE_JWT_AUDIENCES.length === 0) {
    return res.status(400).json({ error: "Connexion Apple non configurée ou token manquant" });
  }
  const idToken = String(rawToken).trim();
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) {
      return res.status(401).json({ error: "Token Apple invalide" });
    }
    const publicKeyPem = await getAppleSigningKeyPem(kid);
    const verified = jwt.verify(idToken, publicKeyPem, {
      algorithms: ["RS256"],
      audience: APPLE_JWT_AUDIENCES.length === 1 ? APPLE_JWT_AUDIENCES[0] : APPLE_JWT_AUDIENCES,
      issuer: "https://appleid.apple.com",
    });
    const email = (verified.email || bodyEmail || "").trim().toLowerCase();
    const appleSub = String(verified.sub || "").trim();
    // Sur les connexions suivantes Apple ne renvoie plus l'email dans le JWT — lookup par sub stocké.
    let user = email ? getUserByEmail(email) : null;
    if (!user && appleSub) {
      user = getUserByAppleSub(appleSub);
    }
    if (!email && !user) {
      return res.status(400).json({ error: "Email non fourni par Apple. Réautorisez l'application pour partager votre email." });
    }
    const isNewUser = !user;
    if (!isNewUser && (authIntent === "sign_up" || authIntent === "signup")) {
      return res.status(409).json({
        error: "Un compte existe déjà avec cet identifiant Apple. Utilisez Se connecter.",
        code: "account_already_exists_social",
      });
    }
    if (isNewUser && !hasSelectedEstablishment(establishmentSelection)) {
      return respondMissingEstablishment(res);
    }
    if (!user) {
      const nameFromBody = bodyName ? String(bodyName).trim() : "";
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({
        email,
        passwordHash: oauthPlaceholder,
        name: nameFromBody || null,
      });
    }
    if (isNewUser) {
      const businessState = await ensureInitialBusinessForUser(user.id, establishmentSelection);
      if (businessState.setup_error_code) {
        return res.status(409).json({
          error: businessState.setup_error_message || "Impossible de créer l'établissement.",
          code: businessState.setup_error_code,
        });
      }
      if (businessState.requires_business_setup) {
        return respondMissingEstablishment(res);
      }
    }
    // Stocker le sub Apple pour les reconnexions sans email
    if (appleSub) setUserAppleSub(user.id, appleSub);
    const { accessToken, refreshToken } = issueTokenPair(user.id);
    return res.json({
      ...buildAuthSuccessPayload(user),
      token: accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error("Apple auth error:", e);
    const msg = e.message || "";
    if (msg.includes("audience") || msg.includes("aud"))
      return res.status(401).json({
        error:
          "Audience JWT Apple refusée : sur Railway, définissez APPLE_CLIENT_ID (Services ID web) et/ou APPLE_BUNDLE_ID (ex. com.myfidpass) pour l’app iOS.",
      });
    if (msg.includes("expired") || msg.includes("exp"))
      return res.status(401).json({ error: "Session Apple expirée. Réessayez la connexion." });
    return res.status(401).json({ error: "Token Apple invalide ou expiré. Vérifiez APPLE_CLIENT_ID (Services ID) sur Railway et la config Apple Developer." });
  }
});

/**
 * POST /api/auth/apple-redirect
 * Reçoit le POST d’Apple (form_post) après Sign in with Apple, vérifie le token,
 * crée un code à usage unique, redirige vers le frontend avec ce code.
 */
router.post("/apple-redirect", async (req, res) => {
  const getFrontendApplePath = (mode) =>
    mode === "auth" ? "/login" : mode === "creation_carte" ? "/creer-ma-carte" : "/checkout";
  if (!APPLE_CLIENT_ID) {
    return res.redirect(FRONTEND_URL + "/checkout?apple_error=config");
  }
  const idToken = (req.body?.id_token || "").trim();
  const stateData = decodeAuthState(req.body?.state);
  const stateMode = String(stateData?.mode || req.body?.state || "checkout").toLowerCase();
  let userPayload = null;
  try {
    const userStr = req.body?.user;
    if (userStr && typeof userStr === "string") userPayload = JSON.parse(decodeURIComponent(userStr));
  } catch (_) { /* ignore */ }
  if (!idToken) {
    return res.redirect(FRONTEND_URL + getFrontendApplePath(stateMode) + "?apple_error=no_token");
  }
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) return res.redirect(FRONTEND_URL + getFrontendApplePath(stateMode) + "?apple_error=invalid");
    const publicKeyPem = await getAppleSigningKeyPem(kid);
    const verified = jwt.verify(idToken, publicKeyPem, {
      algorithms: ["RS256"],
      audience: APPLE_JWT_AUDIENCES.length === 1 ? APPLE_JWT_AUDIENCES[0] : APPLE_JWT_AUDIENCES,
      issuer: "https://appleid.apple.com",
    });
    const email = (verified.email || (userPayload?.email) || "").trim().toLowerCase();
    if (!email) return res.redirect(FRONTEND_URL + getFrontendApplePath(stateMode) + "?apple_error=no_email");
    let user = getUserByEmail(email);
    const isNewUser = !user;
    const establishmentSelection = normalizeEstablishmentSelection(stateData || {});
    if (isNewUser && !hasSelectedEstablishment(establishmentSelection)) {
      const basePath = getFrontendApplePath(stateMode);
      return res.redirect(302, FRONTEND_URL + basePath + "?apple_error=missing_establishment");
    }
    if (!user) {
      const name = userPayload?.name
        ? [userPayload.name.firstName, userPayload.name.lastName].filter(Boolean).join(" ").trim()
        : null;
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({ email, passwordHash: oauthPlaceholder, name: name || null });
    }
    if (isNewUser) {
      const businessState = await ensureInitialBusinessForUser(user.id, establishmentSelection);
      if (businessState.setup_error_code) {
        const basePath = getFrontendApplePath(stateMode);
        return res.redirect(302, FRONTEND_URL + basePath + "?apple_error=" + encodeURIComponent(businessState.setup_error_code));
      }
      if (businessState.requires_business_setup) {
        const basePath = getFrontendApplePath(stateMode);
        return res.redirect(302, FRONTEND_URL + basePath + "?apple_error=missing_establishment");
      }
    }
    const { accessToken, refreshToken } = issueTokenPair(user.id);
    const businessState = getMerchantBusinessState(user.id);
    const code = randomUUID().slice(0, 16) + Date.now().toString(36);
    cleanupAppleCodes();
    appleOneTimeCodes.set(code, {
      token: accessToken,
      refreshToken,
      user: authUserPayload(user),
      businesses: businessState.businesses,
      expiry: Date.now() + APPLE_CODE_TTL_MS,
    });
    const basePath = getFrontendApplePath(stateMode);
    return res.redirect(302, FRONTEND_URL + basePath + "?apple_code=" + encodeURIComponent(code));
  } catch (e) {
    console.error("Apple redirect error:", e);
    return res.redirect(FRONTEND_URL + getFrontendApplePath(stateMode) + "?apple_error=invalid");
  }
});

/**
 * GET /api/auth/apple-exchange?code=xxx
 * Échange un code à usage unique (renvoyé après apple-redirect) contre le JWT.
 */
router.get("/apple-exchange", (req, res) => {
  const code = req.query?.code;
  if (!code) return res.status(400).json({ error: "Code manquant" });
  cleanupAppleCodes();
  const data = appleOneTimeCodes.get(code);
  appleOneTimeCodes.delete(code);
  if (!data || data.expiry < Date.now()) {
    return res.status(401).json({ error: "Code invalide ou expiré" });
  }
  const uid = data.user?.id;
  const subPayload =
    uid != null
      ? authSubscriptionPayload(uid)
      : {
          subscription: null,
          has_active_subscription: false,
          entitlements: {
            allowed_businesses: 1,
            used_businesses: 0,
            can_create_business: true,
            billing_provider: null,
          },
          merchant_trial_ends_at: null,
        };
  return res.json({
    token: data.token,
    refreshToken: data.refreshToken,
    user: data.user,
    businesses: data.businesses,
    ...subPayload,
  });
});

const PASSWORD_RESET_EXPIRY_HOURS = 1;

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Envoie un email avec lien de réinitialisation (si le compte existe). Réponse identique dans tous les cas (sécurité).
 */
router.post("/forgot-password", validate(schemas.forgotPassword), async (req, res) => {
  const { email } = req.body || {};
  const emailNorm = email; // déjà normalisé par Zod
  const message = "Si un compte existe avec cet email, vous recevrez un lien pour réinitialiser votre mot de passe.";
  const user = getUserByEmail(emailNorm);
  if (!user) {
    return res.json({ message });
  }
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  setPasswordResetToken(user.id, token, expiresAt);
  const resetLink = `${FRONTEND_URL}/login?reset=${encodeURIComponent(token)}`;
  const { sent } = await sendMail({
    to: emailNorm,
    subject: "Réinitialisation de votre mot de passe — Myfidpass",
    text: `Bonjour,\n\nVous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous (valable ${PASSWORD_RESET_EXPIRY_HOURS} h) :\n\n${resetLink}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    html: `<p>Bonjour,</p><p>Vous avez demandé à réinitialiser votre mot de passe. <a href="${resetLink}">Cliquez ici</a> (lien valable ${PASSWORD_RESET_EXPIRY_HOURS} h).</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  });
  if (!sent && isEmailConfigured()) {
    return res.status(500).json({ error: "Impossible d'envoyer l'email. Réessayez plus tard." });
  }
  if (!sent) {
    console.warn(
      "[Auth] forgot-password: aucun email envoyé — définir RESEND_API_KEY ou SMTP_HOST+SMTP_USER+SMTP_PASS sur le serveur (Railway). Voir docs/EMAIL-TRANSACTIONNEL.md"
    );
    if (process.env.NODE_ENV !== "production") {
      console.log("[Auth] lien reset (dev uniquement):", resetLink);
    }
  }
  return res.json({ message });
});

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 * Réinitialise le mot de passe avec le token reçu par email.
 */
router.post("/reset-password", validate(schemas.resetPassword), async (req, res) => {
  const { token, newPassword } = req.body || {};
  const tokenStr = token; // déjà validé par Zod
  const row = getPasswordResetByToken(tokenStr);
  if (!row) {
    return res.status(400).json({ error: "Lien invalide ou expiré. Demandez un nouveau lien." });
  }
  const user = getUserById(row.user_id);
  if (!user) {
    deletePasswordResetToken(tokenStr);
    return res.status(400).json({ error: "Lien invalide." });
  }
  try {
    const passwordHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
    updateUserPassword(user.id, passwordHash);
    deletePasswordResetToken(tokenStr);
    return res.json({ message: "Mot de passe mis à jour. Vous pouvez vous connecter." });
  } catch (e) {
    console.error("Reset password error:", e);
    return res.status(500).json({ error: "Erreur lors de la mise à jour du mot de passe." });
  }
});

/**
 * GET /api/auth/me
 * Requiert Authorization: Bearer <token>. Retourne l'utilisateur courant et ses commerces.
 * En 401 : body.code = "expired" | "invalid" | "user_not_found" pour message côté client.
 */
router.get("/me", (req, res, next) => {
  if (!req.user) {
    const code = req.authError || "invalid";
    return res.status(401).json({ error: "Session invalide ou expirée", code });
  }
  try {
    const businesses = getBusinessesForUserId(req.user.id);
    const subPayload = authSubscriptionPayload(req.user.id);
    res.json({
      user: authUserPayload(req.user),
      businesses,
      requires_business_setup: businesses.length === 0,
      subscription: subPayload.subscription,
      has_active_subscription: subPayload.has_active_subscription,
      entitlements: subPayload.entitlements,
      merchant_trial_ends_at: subPayload.merchant_trial_ends_at,
    });
  } catch (e) {
    console.error("GET /api/auth/me:", e);
    const isProd = process.env.NODE_ENV === "production";
    return res.status(500).json({
      error: "Impossible de charger le compte.",
      code: "me_failed",
      ...(!isProd && e?.message ? { detail: String(e.message) } : {}),
    });
  }
});

/**
 * POST /api/auth/revenuecat-sync
 * Après achat in-app, force la mise à jour de `subscriptions` depuis l’API RevenueCat (serveur).
 * L’app appelle ceci juste après un achat / restore pour que les routes API (403) voient l’état payant sans attendre le webhook.
 */
router.post("/revenuecat-sync", requireAuth, async (req, res) => {
  try {
    await syncPremiumFromRevenueCatAppUserId(String(req.user.id).trim());
    const subPayload = authSubscriptionPayload(req.user.id);
    return res.json({ ok: true, ...subPayload });
  } catch (e) {
    console.error("[auth] revenuecat-sync", e);
    return res.status(500).json({
      error: "Synchro abonnement App Store impossible.",
      code: "revenuecat_sync_failed",
    });
  }
});

/**
 * GET /api/me/businesses
 * Alias pour garder une API cohérente (liste des commerces de l'utilisateur).
 */
router.get("/me/businesses", requireAuth, (req, res) => {
  const businesses = getBusinessesForUserId(req.user.id);
  res.json({ businesses });
});

/**
 * DELETE /api/auth/account
 * Supprime définitivement le compte de l'utilisateur connecté (RGPD, exigence App Store).
 */
router.delete("/account", requireAuth, (req, res) => {
  try {
    const deleted = deleteUserAccount(req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: "Compte déjà supprimé.", code: "account_already_deleted" });
    }
    return res.json({ ok: true, message: "Compte supprimé", deleted_user_id: req.user.id });
  } catch (e) {
    console.error("Delete account error:", e);
    return res.status(500).json({ error: "Erreur lors de la suppression du compte." });
  }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Échange un refresh token valide contre une nouvelle paire (rotation).
 * L'ancien refresh token est immédiatement invalidé.
 */
router.post("/refresh", (req, res) => {
  const token = req.body?.refreshToken;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "refreshToken manquant", code: "missing_refresh_token" });
  }
  const stored = getRefreshToken(token);
  if (!stored) {
    return res.status(401).json({ error: "Refresh token invalide ou expiré", code: "invalid_refresh_token" });
  }
  const user = getUserById(stored.user_id != null ? String(stored.user_id) : "");
  if (!user) {
    deleteRefreshToken(token);
    return res.status(401).json({ error: "Utilisateur introuvable", code: "user_not_found" });
  }
  // Rotation : invalider l'ancien et émettre une nouvelle paire
  deleteRefreshToken(token);
  const { accessToken, refreshToken: newRefreshToken } = issueTokenPair(user.id);
  return res.json({
    token: accessToken,
    refreshToken: newRefreshToken,
    user: authUserPayload(user),
    ...authSubscriptionPayload(user.id),
  });
});

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 * Révoque le refresh token (déconnexion propre).
 * Sans refresh token, donne quand même un 200 (stateless — le client supprime son access token).
 */
router.post("/logout", (req, res) => {
  const token = req.body?.refreshToken;
  if (token && typeof token === "string") {
    deleteRefreshToken(token);
  }
  return res.json({ ok: true });
});

// ── Téléphone + OTP SMS (app commerçant) ───────────────────────────────────

const PHONE_OTP_MAX_ATTEMPTS = 5;
const PHONE_SEND_COOLDOWN_SEC = 60;

function hashPhoneOtp(phoneE164, code) {
  const secret = process.env.PHONE_OTP_HMAC_SECRET || process.env.JWT_SECRET || "local-dev-only";
  return createHmac("sha256", secret).update(`${phoneE164}:${code}`).digest("hex");
}

/**
 * POST /api/auth/phone/send-code
 */
router.post("/phone/send-code", validate(schemas.phoneSend), async (req, res) => {
  const rawPhone = req.body.phone;
  const phoneE164 = normalizePhoneE164(rawPhone);
  if (!phoneE164) {
    return res.status(400).json({
      error: "Numéro invalide. Utilisez un mobile français (06 ou 07) ou un numéro au format international (+33…).",
    });
  }

  /** Impossible d’envoyer un SMS vers le même numéro que l’expéditeur Twilio (confusion fréquente en test). */
  const twilioFromRaw = (process.env.TWILIO_FROM_NUMBER || "").trim();
  if (twilioFromRaw) {
    const fromE164 = normalizePhoneE164(twilioFromRaw);
    if (fromE164 && fromE164 === phoneE164) {
      return res.status(400).json({
        error:
          "Indiquez le téléphone sur lequel vous voulez recevoir le code (votre mobile personnel en 06 ou 07). Vous ne pouvez pas utiliser le même numéro que celui configuré pour envoyer les SMS (numéro Twilio).",
        code: "sms_destination_same_as_from",
      });
    }
  }

  const existing = getPhoneOtpChallenge(phoneE164);
  if (existing?.last_sent_at) {
    const last = Date.parse(existing.last_sent_at);
    if (!Number.isNaN(last) && Date.now() - last < PHONE_SEND_COOLDOWN_SEC * 1000) {
      return res.status(429).json({ error: `Attendez ${PHONE_SEND_COOLDOWN_SEC} secondes avant un nouvel envoi.` });
    }
  }

  const code =
    process.env.NODE_ENV === "test"
      ? "123456"
      : String(randomInt(100000, 999999));
  const codeHash = hashPhoneOtp(phoneE164, code);
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  upsertPhoneOtpChallenge(phoneE164, codeHash, expires, now);

  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !isTwilioConfigured()) {
    return res.status(503).json({ error: "Envoi SMS temporairement indisponible." });
  }

  if (isTwilioConfigured()) {
    const msg = `MyFidpass : votre code de connexion est ${code}. Il expire dans 5 minutes.`;
    const sent = await sendSmsViaTwilio(phoneE164, msg);
    if (!sent.ok) {
      console.error("[phone/send-code] Twilio:", sent.error);
      const { message, twilioCode } = friendlyTwilioSendError(sent.error);
      const payload = { error: message };
      if (twilioCode != null) payload.twilio_code = twilioCode;
      return res.status(502).json(payload);
    }
  } else {
    console.warn(`[phone/send-code] SMS non configuré — code pour ${phoneE164} : ${code}`);
  }

  return res.json({ ok: true });
});

/**
 * POST /api/auth/phone/verify
 * Compte existant : connexion. Sinon : création si établissement (lieu) fourni — même règle que l’inscription e-mail.
 */
router.post("/phone/verify", validate(schemas.phoneVerify), async (req, res) => {
  const rawPhone = req.body.phone;
  const code = String(req.body.code || "").trim();
  const phoneE164 = normalizePhoneE164(rawPhone);
  if (!phoneE164) {
    return res.status(400).json({ error: "Numéro de téléphone invalide." });
  }

  const row = getPhoneOtpChallenge(phoneE164);
  if (!row) {
    return res.status(400).json({ error: "Aucun code en attente. Demandez un nouveau code." });
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    deletePhoneOtpChallenge(phoneE164);
    return res.status(400).json({ error: "Code expiré. Demandez un nouveau code." });
  }
  if ((row.attempts || 0) >= PHONE_OTP_MAX_ATTEMPTS) {
    deletePhoneOtpChallenge(phoneE164);
    return res.status(429).json({ error: "Trop de tentatives. Demandez un nouveau code." });
  }

  const expected = row.code_hash;
  const got = hashPhoneOtp(phoneE164, code);
  let a;
  let b;
  try {
    a = Buffer.from(expected, "hex");
    b = Buffer.from(got, "hex");
  } catch {
    incrementPhoneOtpAttempts(phoneE164);
    return res.status(401).json({ error: "Code incorrect." });
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    incrementPhoneOtpAttempts(phoneE164);
    return res.status(401).json({ error: "Code incorrect." });
  }

  deletePhoneOtpChallenge(phoneE164);

  let user = getUserByPhoneE164(phoneE164);
  const establishmentSelection = normalizeEstablishmentSelection(req.body || {});

  if (user) {
    const { accessToken, refreshToken } = issueTokenPair(user.id);
    return res.json({
      ...buildAuthSuccessPayload(user),
      token: accessToken,
      refreshToken,
    });
  }

  if (!hasSelectedEstablishment(establishmentSelection)) {
    return respondMissingEstablishment(res);
  }

  try {
    user = createUserWithPhone({ phoneE164, name: null });
  } catch (e) {
    console.error("[phone/verify] createUserWithPhone:", e);
    return res.status(409).json({ error: "Ce numéro est déjà utilisé. Connectez-vous avec le code." });
  }

  const businessState = await ensureInitialBusinessForUser(user.id, establishmentSelection);
  if (businessState.setup_error_code) {
    return res.status(409).json({
      error: businessState.setup_error_message || "Impossible de créer l'établissement.",
      code: businessState.setup_error_code,
    });
  }
  if (businessState.requires_business_setup) {
    return respondMissingEstablishment(res);
  }

  const { accessToken, refreshToken } = issueTokenPair(user.id);
  return res.status(201).json({
    ...buildAuthSuccessPayload(user),
    token: accessToken,
    refreshToken,
  });
});

/**
 * POST /api/auth/ensure-demo
 * Crée ou réinitialise le compte démo pour l'examen App Store Review.
 * Appelé une fois après chaque déploiement via curl (secret partagé).
 */
router.post("/ensure-demo", async (req, res) => {
  const DEMO_EMAIL = "aminennasri@outlook.com";
  const DEMO_PASSWORD = "Meysann35!";
  const DEMO_NAME = "Demo MyFidPass";
  const secret = String(req.headers["x-demo-secret"] || req.body?.secret || "").trim();
  const validSecret = process.env.DEMO_SECRET || "myfidpass-appstore-review-2026";
  if (secret !== validSecret) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const hash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
    let user = getUserByEmail(DEMO_EMAIL);
    if (user) {
      updateUserPassword(user.id, hash);
    } else {
      user = createUser({ email: DEMO_EMAIL, passwordHash: hash, name: DEMO_NAME });
      const businesses = getBusinessesByUserId(user.id);
      if (!businesses || businesses.length === 0) {
        await ensureInitialBusinessForUser(user.id, {
          establishments: [{ googlePlaceId: null, establishmentName: "MyFidPass Demo" }],
        });
      }
    }
    return res.json({ ok: true, email: DEMO_EMAIL });
  } catch (e) {
    console.error("[ensure-demo] error:", e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
