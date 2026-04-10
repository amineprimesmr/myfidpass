/**
 * Métriques sociales & avis : historique, refresh Google Places, saisie manuelle (followers, etc.).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getEngagementRewards } from "../../db.js";
import {
  insertSocialMetricSnapshot,
  getLatestSnapshot,
} from "../../db/social-metrics.js";
import {
  buildSocialMetricsSummary,
  refreshGoogleSnapshotForBusiness,
  listEngagementChannelKeys,
  channelLabel,
} from "../../services/social-metrics-service.js";

const router = Router({ mergeParams: true });

const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `social-metrics-refresh:${req.business?.id ?? req.ip}`,
  message: { error: "Trop de rafraîchissements. Réessayez plus tard." },
});

router.get("/social-metrics", (req, res) => {
  const business = req.business;
  const rewards = getEngagementRewards(business.id);
  const summary = buildSocialMetricsSummary(business.id, rewards);
  return res.json(summary);
});

router.post("/social-metrics/refresh", refreshLimiter, async (req, res) => {
  const business = req.business;
  const rewards = getEngagementRewards(business.id);
  const gr = rewards.google_review;
  const placeId = String(gr?.place_id ?? "").trim();
  if (!gr?.enabled || !placeId) {
    return res.status(400).json({ error: "Mission Google ou Place ID non configuré." });
  }
  try {
    const result = await refreshGoogleSnapshotForBusiness(business.id, placeId);
    if (!result.ok) {
      return res.status(502).json({ error: result.error || "google_fetch_failed" });
    }
    const summary = buildSocialMetricsSummary(business.id, rewards);
    return res.json({ ...summary, refresh: result });
  } catch (e) {
    return res.status(500).json({ error: "Erreur lors du rafraîchissement." });
  }
});

/**
 * POST { channel, followers? | reviews_count? | rating? }
 */
router.post("/social-metrics/manual", (req, res) => {
  const business = req.business;
  const body = req.body || {};
  const channel = String(body.channel || "").trim();
  const keys = listEngagementChannelKeys();
  if (!keys.includes(channel)) {
    return res.status(400).json({ error: "channel_invalide" });
  }
  if (channel === "google_review") {
    return res.status(400).json({ error: "utilisez_refresh_pour_google" });
  }

  const rewards = getEngagementRewards(business.id);
  const cfg = rewards[channel];
  const url = String(cfg?.url ?? "").trim();
  if (!cfg?.enabled || !url) {
    return res.status(400).json({ error: "mission_desactivee_ou_url_manquante" });
  }

  const metrics = {};
  const followers = body.followers ?? body.followers_count;
  if (followers != null && followers !== "") {
    const n = Math.floor(Number(followers));
    if (!Number.isFinite(n) || n < 0 || n > 500_000_000) {
      return res.status(400).json({ error: "followers_invalide" });
    }
    metrics.followers = n;
  }
  const reviewsCount = body.reviews_count;
  if (reviewsCount != null && reviewsCount !== "") {
    const n = Math.floor(Number(reviewsCount));
    if (!Number.isFinite(n) || n < 0 || n > 500_000_000) {
      return res.status(400).json({ error: "reviews_count_invalide" });
    }
    metrics.reviews_count = n;
  }
  if (body.rating != null && body.rating !== "") {
    const r = Number(body.rating);
    if (!Number.isFinite(r) || r < 0 || r > 5) {
      return res.status(400).json({ error: "rating_invalide" });
    }
    metrics.rating = Math.round(r * 100) / 100;
  }

  if (Object.keys(metrics).length === 0) {
    return res.status(400).json({ error: "aucune_metrique" });
  }

  const latest = getLatestSnapshot(business.id, channel);
  if (latest) {
    let prev = {};
    try {
      prev = JSON.parse(latest.metrics_json || "{}");
    } catch (_) {
      prev = {};
    }
    const same = Object.keys(metrics).every((k) => Number(metrics[k]) === Number(prev[k]));
    if (same && Object.keys(metrics).length === Object.keys(prev).length) {
      const summary = buildSocialMetricsSummary(business.id, rewards);
      return res.json({ ...summary, manual: { skipped: true } });
    }
  }

  insertSocialMetricSnapshot(business.id, channel, "manual", metrics);
  const summary = buildSocialMetricsSummary(business.id, rewards);
  return res.json({ ...summary, manual: { saved: true, channel, label: channelLabel(channel) } });
});

export default router;
