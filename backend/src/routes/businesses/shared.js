/**
 * Helpers et middleware partagés pour les routes businesses.
 * Référence : REFONTE-REGLES.md — routes < 15 par fichier.
 */
import { getBusinessBySlug, getBusinessByDashboardToken, hasActiveSubscription } from "../../db.js";
import { devPaymentBypass } from "../../lib/dev-payment-bypass.js";

export function getApiBase(req) {
  return (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
}

export function getClientIp(req) {
  const hdr = req.get("x-forwarded-for") || req.get("x-real-ip");
  const ip = (hdr || req.ip || "").toString().split(",")[0].trim();
  return ip || "";
}

const START_RATE_BUCKET = new Map();
export function checkStartRateLimit(ipHash) {
  if (!ipHash) return true;
  const now = Date.now();
  const key = `start:${ipHash}`;
  const windowMs = 60 * 1000;
  const maxCalls = 20;
  const row = START_RATE_BUCKET.get(key) || { count: 0, ts: now };
  if (now - row.ts > windowMs) {
    START_RATE_BUCKET.set(key, { count: 1, ts: now });
    return true;
  }
  if (row.count >= maxCalls) return false;
  row.count += 1;
  START_RATE_BUCKET.set(key, row);
  return true;
}

export function getIdempotencyKey(req) {
  const key = (req.get("Idempotency-Key") || "").trim();
  if (!key) return null;
  return key.slice(0, 120);
}

/**
 * Accès tableau de bord / caisse : JWT ou token dashboard, puis abonnement actif (ou essai Stripe).
 * @returns {"ok" | "no_business" | "no_access" | "subscription_required"}
 */
export function checkDashboardAuth(business, req) {
  if (!business) return "no_business";
  const token = (req.query.token || req.get("X-Dashboard-Token") || "").toString().trim();
  let allowed = false;
  if (token) {
    const byToken = getBusinessByDashboardToken(token);
    if (byToken && byToken.id === business.id) allowed = true;
  }
  if (!allowed && req.user) {
    const uid = req.user.id != null ? String(req.user.id).trim() : "";
    const bid = business.user_id != null ? String(business.user_id).trim() : "";
    if (uid !== "" && bid !== "" && uid === bid) allowed = true;
  }
  if (!allowed) return "no_access";
  const ownerId = business.user_id != null ? String(business.user_id) : "";
  if (ownerId && !devPaymentBypass(req) && !hasActiveSubscription(ownerId)) {
    return "subscription_required";
  }
  return "ok";
}

export function canAccessDashboard(business, req) {
  return checkDashboardAuth(business, req) === "ok";
}

/** Envoie la réponse HTTP adaptée ; retourne true si l’accès est OK. */
export function ensureDashboardAccess(req, res, business) {
  const r = checkDashboardAuth(business, req);
  if (r === "ok") return true;
  if (r === "no_business") {
    res.status(404).json({ error: "Entreprise introuvable" });
    return false;
  }
  if (r === "no_access") {
    res.status(401).json({ error: "Token ou authentification requis" });
    return false;
  }
  res.status(403).json({
    error: "Abonnement actif requis pour utiliser cette fonctionnalité.",
    code: "subscription_required",
  });
  return false;
}

export function normalizeHexForPatch(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`;
  return null;
}

export function normalizeHex(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

export const MAX_LOGO_BASE64_BYTES = 4 * 1024 * 1024; // 4 Mo

/** Extrait l'ID membre (UUID) du code scanné : brut ou contenu dans une URL. */
export function normalizeBarcodeToMemberId(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const uuidMatch = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) return uuidMatch[0];
  if (/^[0-9a-fA-F-]{36}$/.test(s)) return s;
  return s;
}

export { getBusinessBySlug };
