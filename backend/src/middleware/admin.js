import { requireAuth } from "./auth.js";
import { isUserAdmin } from "../db/users.js";

/**
 * Après `optionalAuth` / `requireAuth` : accès réservé aux comptes `is_admin`.
 */
export function requirePlatformAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  if (!isUserAdmin(req.user)) {
    return res.status(403).json({ error: "Accès administrateur requis", code: "admin_only" });
  }
  next();
}

/** Chaîne Express : JWT obligatoire + admin. */
export const requireAuthAndPlatformAdmin = [requireAuth, requirePlatformAdmin];
