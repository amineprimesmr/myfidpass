import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, createPublicKey } from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getBusinessesByUserId,
  getSubscriptionByUserId,
  hasActiveSubscription,
  setPasswordResetToken,
  getPasswordResetByToken,
  deletePasswordResetToken,
  updateUserPassword,
  deleteUserAccount,
  createBusiness,
  updateBusiness,
  getBusinessBySlug,
  canCreateBusiness,
} from "../db.js";
import { requireAuth, getJwtSecret } from "../middleware/auth.js";
import { sendMail, isEmailConfigured } from "../email.js";
import { validate, schemas } from "../lib/validate.js";

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
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

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
 */
async function tryCreateFirstBusinessFromGooglePlace(userId, placeId, establishmentNameHint) {
  const pid = String(placeId || "").trim();
  if (!pid || !GOOGLE_PLACES_API_KEY) return;
  if (!canCreateBusiness(userId)) return;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(pid)}&fields=name,formatted_address,geometry&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status !== "OK" || !data.result) {
      console.warn("[auth/register] place details:", data.status);
      return;
    }
    const result = data.result;
    const hint = String(establishmentNameHint || "").trim();
    const name = (result.name || hint || "Mon établissement").trim();
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
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    const addr = result.formatted_address?.trim() || null;
    if (addr || (lat != null && lng != null)) {
      updateBusiness(biz.id, {
        location_lat: lat ?? null,
        location_lng: lng ?? null,
        location_address: addr,
      });
    }
  } catch (e) {
    console.error("[auth/register] tryCreateFirstBusinessFromGooglePlace:", e);
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
 * POST /api/auth/register
 * Body: { email, password, name?, google_place_id? | googlePlaceId?, establishment_name? }
 * Si google_place_id est fourni et Places configuré, crée le premier commerce (nom + adresse Google).
 */
router.post("/register", validate(schemas.register), async (req, res) => {
  const body = req.body || {};
  const { email, password, name } = body;
  const googlePlaceId = String(body.google_place_id || body.googlePlaceId || "").trim();
  const establishmentName = String(body.establishment_name || body.establishmentName || "").trim();
  // email et password déjà validés et normalisés par Zod (register schema)
  const emailNorm = email; // déjà toLowerCase() par le schéma
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
    if (googlePlaceId) {
      await tryCreateFirstBusinessFromGooglePlace(user.id, googlePlaceId, establishmentName);
    }
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: "90d" });
    const businesses = getBusinessesByUserId(user.id);
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
      businesses,
    });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Erreur lors de la création du compte" });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post("/login", validate(schemas.login), async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = email; // déjà normalisé par Zod
  const user = getUserByEmail(emailNorm);
  if (!user) {
    return res.status(404).json({ error: "Aucun compte associé à cet email. Créez votre compte sur myfidpass.fr.", code: "NO_ACCOUNT" });
  }
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Email ou mot de passe incorrect" });
  }
  const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: "90d" });
  const businesses = getBusinessesByUserId(user.id);
  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    token,
    businesses,
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
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: "90d" });
    const businesses = getBusinessesByUserId(user.id);
    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
      businesses,
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
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: "90d" });
    return res.redirect(302, `${redirectApp}?token=${encodeURIComponent(token)}`);
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
    if (!email) {
      return res.status(400).json({ error: "Email non fourni par Apple. Réautorisez l'application pour partager votre email." });
    }
    let user = getUserByEmail(email);
    if (!user) {
      const nameFromBody = bodyName ? String(bodyName).trim() : "";
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({
        email,
        passwordHash: oauthPlaceholder,
        name: nameFromBody || null,
      });
    }
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: "90d" });
    const businesses = getBusinessesByUserId(user.id);
    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
      businesses,
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
  if (!APPLE_CLIENT_ID) {
    return res.redirect(FRONTEND_URL + "/checkout?apple_error=config");
  }
  const idToken = (req.body?.id_token || "").trim();
  const state = (req.body?.state || "checkout").toLowerCase();
  let userPayload = null;
  try {
    const userStr = req.body?.user;
    if (userStr && typeof userStr === "string") userPayload = JSON.parse(decodeURIComponent(userStr));
  } catch (_) { /* ignore */ }
  if (!idToken) {
    return res.redirect(FRONTEND_URL + (state === "auth" ? "/login" : "/checkout") + "?apple_error=no_token");
  }
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) return res.redirect(FRONTEND_URL + "/checkout?apple_error=invalid");
    const publicKeyPem = await getAppleSigningKeyPem(kid);
    const verified = jwt.verify(idToken, publicKeyPem, {
      algorithms: ["RS256"],
      audience: APPLE_JWT_AUDIENCES.length === 1 ? APPLE_JWT_AUDIENCES[0] : APPLE_JWT_AUDIENCES,
      issuer: "https://appleid.apple.com",
    });
    const email = (verified.email || (userPayload?.email) || "").trim().toLowerCase();
    if (!email) return res.redirect(FRONTEND_URL + "/checkout?apple_error=no_email");
    let user = getUserByEmail(email);
    if (!user) {
      const name = userPayload?.name
        ? [userPayload.name.firstName, userPayload.name.lastName].filter(Boolean).join(" ").trim()
        : null;
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({ email, passwordHash: oauthPlaceholder, name: name || null });
    }
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: "90d" });
    const businesses = getBusinessesByUserId(user.id);
    const code = randomUUID().slice(0, 16) + Date.now().toString(36);
    cleanupAppleCodes();
    appleOneTimeCodes.set(code, {
      token,
      user: { id: user.id, email: user.email, name: user.name },
      businesses,
      expiry: Date.now() + APPLE_CODE_TTL_MS,
    });
    const basePath = state === "auth" ? "/login" : "/checkout";
    return res.redirect(302, FRONTEND_URL + basePath + "?apple_code=" + encodeURIComponent(code));
  } catch (e) {
    console.error("Apple redirect error:", e);
    return res.redirect(FRONTEND_URL + "/checkout?apple_error=invalid");
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
  return res.json({ token: data.token, user: data.user, businesses: data.businesses });
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
    to: user.email,
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
    const businesses = getBusinessesByUserId(req.user.id);
    const subscription = getSubscriptionByUserId(req.user.id);
    res.json({
      user: { id: req.user.id, email: req.user.email, name: req.user.name },
      businesses,
      subscription: subscription ? { status: subscription.status, plan_id: subscription.plan_id } : null,
      has_active_subscription: hasActiveSubscription(req.user.id),
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
 * GET /api/me/businesses
 * Alias pour garder une API cohérente (liste des commerces de l'utilisateur).
 */
router.get("/me/businesses", requireAuth, (req, res) => {
  const businesses = getBusinessesByUserId(req.user.id);
  res.json({ businesses });
});

/**
 * DELETE /api/auth/account
 * Supprime définitivement le compte de l'utilisateur connecté (RGPD, exigence App Store).
 */
router.delete("/account", requireAuth, (req, res) => {
  try {
    deleteUserAccount(req.user.id);
    return res.json({ ok: true, message: "Compte supprimé" });
  } catch (e) {
    console.error("Delete account error:", e);
    return res.status(500).json({ error: "Erreur lors de la suppression du compte." });
  }
});

export default router;
