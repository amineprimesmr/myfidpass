/**
 * Helpers et middleware partagés pour les routes businesses.
 * Référence : REFONTE-REGLES.md — routes < 15 par fichier.
 */
import { getBusinessBySlug, getBusinessByDashboardToken } from "../../db.js";

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

export function canAccessDashboard(business, req) {
  if (!business) return false;
  const token = req.query.token || req.get("X-Dashboard-Token");
  const byToken = getBusinessByDashboardToken(token);
  if (byToken && byToken.id === business.id) return true;
  if (req.user && business.user_id === req.user.id) return true;
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
