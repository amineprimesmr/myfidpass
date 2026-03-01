import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, createPublicKey } from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  createUser,
  getUserByEmail,
  getBusinessesByUserId,
  getSubscriptionByUserId,
  hasActiveSubscription,
} from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || ""; // Service ID (bundle id) pour vérifier l'audience
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
const SALT_ROUNDS = 10;

const appleOneTimeCodes = new Map();
const APPLE_CODE_TTL_MS = 5 * 60 * 1000;
function cleanupAppleCodes() {
  const now = Date.now();
  for (const [code, data] of appleOneTimeCodes.entries()) {
    if (data.expiry < now) appleOneTimeCodes.delete(code);
  }
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

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
 * Body: { email, password, name? }
 */
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm) {
    return res.status(400).json({ error: "Email requis" });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Mot de passe requis (8 caractères minimum)" });
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
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "90d" });
    const businesses = getBusinessesByUserId(user.id);
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    console.warn("JWT_SECRET non défini en production : définir la variable sur Railway pour une connexion stable.");
  }
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
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }
  const user = getUserByEmail(emailNorm);
  if (!user) {
    return res.status(401).json({ error: "Email ou mot de passe incorrect" });
  }
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Email ou mot de passe incorrect" });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "90d" });
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
 */
router.post("/google", async (req, res) => {
  const idToken = req.body?.idToken || req.body?.credential;
  if (!idToken || !GOOGLE_CLIENT_ID || !googleClient) {
    return res.status(400).json({ error: "Connexion Google non configurée ou token manquant" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: String(idToken),
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = (payload?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email non fourni par Google" });
    }
    let user = getUserByEmail(email);
    if (!user) {
      const name = [payload?.given_name, payload?.family_name].filter(Boolean).join(" ").trim() || payload?.name || null;
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({
        email,
        passwordHash: oauthPlaceholder,
        name: name || null,
      });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "90d" });
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
 * POST /api/auth/apple
 * Body: { idToken, name?, email? } — name/email optionnels (première auth Apple peut les envoyer côté client)
 * Vérifie le token Apple (JWKS), crée ou récupère l'utilisateur, retourne le JWT.
 */
router.post("/apple", async (req, res) => {
  const { idToken: rawToken, name: bodyName, email: bodyEmail } = req.body || {};
  if (!rawToken || !APPLE_CLIENT_ID) {
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
      audience: APPLE_CLIENT_ID,
      issuer: "https://appleid.apple.com",
    });
    const email = (verified.email || bodyEmail || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email non fourni par Apple. Réautorisez l'application pour partager votre email." });
    }
    let user = getUserByEmail(email);
    if (!user) {
      const name = (bodyName || "").trim() || null;
      const oauthPlaceholder = await bcrypt.hash(randomUUID() + "oauth", SALT_ROUNDS);
      user = createUser({
        email,
        passwordHash: oauthPlaceholder,
        name,
      });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "90d" });
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
      return res.status(401).json({ error: "Configuration Apple incorrecte : utilisez le Services ID (pas le Bundle ID) pour APPLE_CLIENT_ID sur Railway." });
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
  } catch (_) {}
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
      audience: APPLE_CLIENT_ID,
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
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "90d" });
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
  const businesses = getBusinessesByUserId(req.user.id);
  const subscription = getSubscriptionByUserId(req.user.id);
  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name },
    businesses,
    subscription: subscription ? { status: subscription.status, planId: subscription.plan_id } : null,
    hasActiveSubscription: hasActiveSubscription(req.user.id),
  });
});

/**
 * GET /api/me/businesses
 * Alias pour garder une API cohérente (liste des commerces de l'utilisateur).
 */
router.get("/me/businesses", requireAuth, (req, res) => {
  const businesses = getBusinessesByUserId(req.user.id);
  res.json({ businesses });
});

export default router;
