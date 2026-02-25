import jwt from "jsonwebtoken";
import { getUserById } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

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
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.userId);
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

export { JWT_SECRET };
