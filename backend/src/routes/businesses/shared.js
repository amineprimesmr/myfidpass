/**
 * Helpers et middleware partagés pour les routes businesses.
 * Référence : REFONTE-REGLES.md — routes < 15 par fichier.
 */
import { getBusinessBySlug, getBusinessByDashboardToken, hasOperationalMerchantAccess } from "../../db.js";
import { isUserAdmin } from "../../db/users.js";
import { getTeamRoleForUserAndBusiness } from "../../db/business-team.js";
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

const SUBSCRIPTION_REQUIRED_BODY = {
  error:
    "Abonnement actif requis (ou période d’essai gratuite expirée). Les nouveaux comptes ont 24 h d’accès complet ; souscrivez via Stripe pour continuer.",
  code: "subscription_required",
};

/**
 * Identité tableau de bord / caisse uniquement (JWT ou token dashboard) — sans exiger l’abonnement (freemium : config).
 * @returns {"ok" | "no_business" | "no_access"}
 */
export function checkDashboardIdentity(business, req) {
  if (!business) return "no_business";
  const token = (req.query.token || req.get("X-Dashboard-Token") || "").toString().trim();
  let allowed = false;
  if (token) {
    const byToken = getBusinessByDashboardToken(token);
    if (byToken && byToken.id === business.id) allowed = true;
  }
  if (!allowed && req.user) {
    if (isUserAdmin(req.user)) {
      allowed = true;
      req.workspaceTeamRole = "admin";
    } else {
      const uid = req.user.id != null ? String(req.user.id).trim() : "";
      const bid = business.user_id != null ? String(business.user_id).trim() : "";
      if (uid !== "" && bid !== "" && uid === bid) {
        allowed = true;
        req.workspaceTeamRole = "owner";
      } else {
        const tr = getTeamRoleForUserAndBusiness(business.id, req.user.id);
        if (tr) {
          allowed = true;
          req.workspaceTeamRole = tr;
        }
      }
    }
  }
  if (!allowed) return "no_access";
  return "ok";
}

/**
 * Bloque écriture dashboard pour comptes **employé** (accès équipe uniquement, rôle `staff`).
 * Les mutations avec seul `X-Dashboard-Token` (sans JWT) ne sont pas bloquées ici.
 */
export function blockStaffDashboardWrites(req, res, business) {
  if (!business || !req.user) return true;
  const m = (req.method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  if (req.workspaceTeamRole !== "staff") return true;
  const bid = business.user_id != null ? String(business.user_id).trim() : "";
  const uid = req.user.id != null ? String(req.user.id).trim() : "";
  if (bid && uid && bid === uid) return true;
  res.status(403).json({
    error: "Cette action est réservée au responsable du commerce.",
    code: "forbidden_for_staff",
  });
  return false;
}

/** @deprecated préférer checkDashboardIdentity — nom historique */
export function checkDashboardAuth(business, req) {
  return checkDashboardIdentity(business, req);
}

export function canAccessDashboard(business, req) {
  return checkDashboardIdentity(business, req) === "ok";
}

/** Accès identité dashboard uniquement (réglages, stats, liste membres, etc.). */
export function ensureDashboardAccess(req, res, business) {
  const r = checkDashboardIdentity(business, req);
  if (r === "ok") return true;
  if (r === "no_business") {
    res.status(404).json({ error: "Entreprise introuvable" });
    return false;
  }
  res.status(401).json({ error: "Token ou authentification requis" });
  return false;
}

/**
 * Après `ensureDashboardAccess` : vérifie abonnement actif / essai (ou bypass dev).
 * À utiliser seul si l’identité dashboard est déjà garantie.
 */
export function assertOperationalSubscription(req, res, business) {
  if (req.user && isUserAdmin(req.user)) return true;
  const ownerId = business.user_id != null ? String(business.user_id).trim() : "";
  if (!ownerId) {
    res.status(403).json(SUBSCRIPTION_REQUIRED_BODY);
    return false;
  }
  if (devPaymentBypass(req) || hasOperationalMerchantAccess(ownerId)) return true;
  res.status(403).json(SUBSCRIPTION_REQUIRED_BODY);
  return false;
}

/** Identité dashboard + abonnement actif (scan, crédit points, campagnes, etc.). */
export function ensureOperationalSubscription(req, res, business) {
  if (!ensureDashboardAccess(req, res, business)) return false;
  return assertOperationalSubscription(req, res, business);
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
