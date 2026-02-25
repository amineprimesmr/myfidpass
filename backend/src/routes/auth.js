import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createUser,
  getUserByEmail,
  getBusinessesByUserId,
  getSubscriptionByUserId,
  createOrUpdateSubscription,
  hasActiveSubscription,
} from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const SALT_ROUNDS = 10;

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
    createOrUpdateSubscription({ userId: user.id, planId: "starter", status: "active" });
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
  if (!getSubscriptionByUserId(user.id)) {
    createOrUpdateSubscription({ userId: user.id, planId: "starter", status: "active" });
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
 * GET /api/auth/me
 * Requiert Authorization: Bearer <token>. Retourne l'utilisateur courant et ses commerces.
 * En 401 : body.code = "expired" | "invalid" | "user_not_found" pour message côté client.
 */
router.get("/me", (req, res, next) => {
  if (!req.user) {
    const code = req.authError || "invalid";
    return res.status(401).json({ error: "Session invalide ou expirée", code });
  }
  if (!getSubscriptionByUserId(req.user.id)) {
    createOrUpdateSubscription({ userId: req.user.id, planId: "starter", status: "active" });
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
