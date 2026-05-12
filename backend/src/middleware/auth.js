import jwt from "jsonwebtoken";
import { getUserById } from "../db.js";
import { getJwtSecret } from "../lib/config.js";

/**
 * Cache en mémoire (TTL court) du user résolu par JWT.
 * Évite un SELECT `getUserById` à CHAQUE requête API : sur 50 RPS, c'est ~50 lectures
 * SQLite synchrones / seconde rien que pour résoudre l'user (déjà fait à l'auth, redondant ici).
 *
 * Clé = userId (pas le JWT entier : éviter de garder des tokens en RAM).
 * TTL court (30 s) → invalidations métier (changement permissions, ban) se propagent rapidement.
 * Taille max bornée → pas de fuite mémoire si beaucoup d'utilisateurs uniques en pic.
 */
const USER_CACHE_TTL_MS = Math.max(0, parseInt(String(process.env.AUTH_USER_CACHE_TTL_MS || "30000"), 10) || 30000);
const USER_CACHE_MAX_ENTRIES = 5000;
const userCache = new Map(); // userId -> { user, expiresAt }

function cacheGetUser(userId) {
  if (USER_CACHE_TTL_MS <= 0) return undefined;
  const entry = userCache.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    userCache.delete(userId);
    return undefined;
  }
  return entry.user;
}

function cacheSetUser(userId, user) {
  if (USER_CACHE_TTL_MS <= 0) return;
  // Borne taille : si on dépasse, drop le plus ancien (Map garde l'ordre d'insertion).
  if (userCache.size >= USER_CACHE_MAX_ENTRIES) {
    const oldestKey = userCache.keys().next().value;
    if (oldestKey !== undefined) userCache.delete(oldestKey);
  }
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/**
 * Invalidation explicite (à appeler après modifs critiques : changement password, ban, suppression).
 * @param {string} userId
 */
export function invalidateAuthUserCache(userId) {
  if (!userId) return;
  userCache.delete(String(userId));
}

/**
 * Invalidation globale (changement JWT_SECRET, migration majeure).
 */
export function clearAuthUserCache() {
  userCache.clear();
}

/**
 * Vérifie le JWT (header Authorization: Bearer <token>) et attache req.user.
 * En cas d'échec, req.authError = "expired" | "invalid" pour permettre des messages clairs.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  req.authError = null;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    const rawId = payload.userId ?? payload.sub;
    const userId = rawId != null && rawId !== "" ? String(rawId) : null;
    if (!userId) {
      req.user = null;
      req.authError = "invalid";
      return next();
    }
    let user = cacheGetUser(userId);
    if (user === undefined) {
      user = getUserById(userId) || null;
      cacheSetUser(userId, user);
    }
    req.user = user || null;
    if (!user) req.authError = "user_not_found";
  } catch (err) {
    req.user = null;
    req.authError = err.name === "TokenExpiredError" ? "expired" : "invalid";
  }
  next();
}

/**
 * Exige un utilisateur connecté. Renvoie 401 si pas de JWT ou invalide.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  next();
}

// Exporter getJwtSecret pour les routes qui en ont besoin
export { getJwtSecret };
