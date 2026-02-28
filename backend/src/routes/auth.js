import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { OAuth2Client } from "google-auth-library";
import jwksClient from "jwks-rsa";
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
const SALT_ROUNDS = 10;

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const appleJwks = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  cache: true,
  cacheMaxAge: 600000,
});

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
    const signingKey = await appleJwks.getSigningKey(kid);
    const publicKey = signingKey.getPublicKey();
    const verified = jwt.verify(idToken, publicKey, {
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
    return res.status(401).json({ error: "Token Apple invalide ou expiré" });
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
