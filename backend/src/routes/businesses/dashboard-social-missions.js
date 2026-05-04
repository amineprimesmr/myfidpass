/**
 * Missions réseaux sociaux (Instagram, TikTok, Facebook, X) — config commerçant par pseudo.
 * Distinct de dashboard-social-metrics.js qui gère les snapshots OAuth + Places.
 */
import { Router } from "express";
import { getDb } from "../../db/connection.js";
import { getEngagementRewards } from "../../db.js";
import { updateBusiness } from "../../db/businesses.js";
import { ensureDashboardAccess } from "./shared.js";

const router = Router({ mergeParams: true });

const SOCIAL_NETWORKS = ["instagram", "tiktok", "facebook", "twitter"];

const NETWORK_KEY_MAP = {
  instagram: "instagram_follow",
  tiktok: "tiktok_follow",
  facebook: "facebook_follow",
  twitter: "twitter_follow",
};

function buildUrl(network, username) {
  const h = String(username || "").trim().replace(/^@/, "").replace(/\s/g, "");
  if (!h) return "";
  switch (network) {
    case "instagram": return `https://instagram.com/${h}`;
    case "tiktok":    return `https://www.tiktok.com/@${h}`;
    case "facebook":  return `https://www.facebook.com/${h}`;
    case "twitter":   return `https://x.com/${h}`;
    default:          return "";
  }
}

function extractUsername(network, storedUrl) {
  const t = String(storedUrl || "").trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    const parts = u.pathname.replace(/^\//, "").split("/");
    switch (network) {
      case "tiktok": {
        const seg = parts[0] || "";
        return seg.startsWith("@") ? seg.slice(1) : seg;
      }
      default: return parts[0] || "";
    }
  } catch {
    return t;
  }
}

/**
 * GET /:slug/dashboard/social-missions
 * Retourne la config actuelle (username, points, enabled) des 4 réseaux.
 */
router.get("/social-missions", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const rewards = getEngagementRewards(business.id);
  const result = {};
  for (const net of SOCIAL_NETWORKS) {
    const key = NETWORK_KEY_MAP[net];
    const cfg = rewards[key] || {};
    result[net] = {
      enabled: !!(cfg.enabled),
      username: extractUsername(net, cfg.url || ""),
      url: cfg.url || "",
      points: Number.isFinite(Number(cfg.points)) ? Number(cfg.points) : 20,
    };
  }
  return res.json(result);
});

/**
 * PATCH /:slug/dashboard/social-missions
 * Body : { instagram?: { username, enabled, points }, tiktok?: {...}, facebook?: {...}, twitter?: {...} }
 * Génère automatiquement l'URL à partir du pseudo.
 */
router.patch("/social-missions", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const body = req.body || {};

  const rewards = getEngagementRewards(business.id);
  let changed = false;

  for (const net of SOCIAL_NETWORKS) {
    const patch = body[net];
    if (!patch || typeof patch !== "object") continue;
    const key = NETWORK_KEY_MAP[net];
    const prev = rewards[key] || {};

    const username = patch.username !== undefined
      ? String(patch.username || "").trim().replace(/^@/, "")
      : extractUsername(net, prev.url || "");
    const url = username ? buildUrl(net, username) : (prev.url || "");
    const enabled = patch.enabled !== undefined ? !!patch.enabled : !!(prev.enabled);
    const pts = patch.points !== undefined ? Math.max(1, Math.min(200, Math.floor(Number(patch.points) || 20))) : (Number(prev.points) || 20);

    rewards[key] = { ...prev, url, enabled: enabled && !!url, points: pts };
    changed = true;
  }

  if (!changed) return res.status(400).json({ error: "Aucun réseau à mettre à jour." });

  updateBusiness(business.id, { engagement_rewards: rewards });

  const result = {};
  for (const net of SOCIAL_NETWORKS) {
    const key = NETWORK_KEY_MAP[net];
    const cfg = rewards[key] || {};
    result[net] = {
      enabled: !!(cfg.enabled),
      username: extractUsername(net, cfg.url || ""),
      url: cfg.url || "",
      points: Number(cfg.points) || 20,
    };
  }
  return res.json(result);
});

/**
 * GET /:slug/dashboard/social-missions/stats
 * Claims (follows auto-déclarés) par réseau sur la période courante.
 */
router.get("/social-missions/stats", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const db = getDb();
  const result = {};
  for (const net of SOCIAL_NETWORKS) {
    const key = NETWORK_KEY_MAP[net];
    try {
      const row = db.prepare(
        `SELECT COUNT(*) as n FROM engagement_completions
         WHERE business_id = ? AND action_type = ? AND status = 'approved'`
      ).get(business.id, key);
      result[net] = row?.n ?? 0;
    } catch {
      result[net] = 0;
    }
  }
  return res.json(result);
});

export default router;
