/**
 * Métriques sociales & avis : historique, refresh Google Places + OAuth (Meta, YouTube, TikTok).
 */
import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getEngagementRewards } from "../../db.js";
import {
  insertSocialMetricSnapshot,
  getLatestSnapshot,
} from "../../db/social-metrics.js";
import {
  getSocialOAuthConnection,
  PROVIDER_META_INSTAGRAM,
  PROVIDER_GOOGLE_YOUTUBE,
  PROVIDER_GOOGLE_BUSINESS,
  PROVIDER_TIKTOK,
} from "../../db/social-oauth.js";
import {
  buildSocialMetricsSummary,
  refreshGoogleSnapshotForBusiness,
  refreshGooglePlacesSnapshotFromPlaceId,
  refreshInstagramOAuthForBusiness,
  refreshFacebookFanOAuthForBusiness,
  refreshYouTubeOAuthForBusiness,
  refreshTikTokOAuthForBusiness,
  listEngagementChannelKeys,
  channelLabel,
} from "../../services/social-metrics-service.js";
import { getLatestSnapshot } from "../../db/social-metrics.js";

const router = Router({ mergeParams: true });

const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `social-metrics-refresh:${req.business?.id ?? ipKeyGenerator(req.ip ?? "127.0.0.1")}`,
  message: { error: "Trop de rafraîchissements. Réessayez plus tard." },
});

router.get("/social-metrics", (req, res) => {
  const business = req.business;
  const rewards = getEngagementRewards(business.id);

  // Auto-déclenche un snapshot Places si le place_id est configuré mais aucun snapshot n'existe.
  // Couvre les comptes créés avant l'ajout du déclencheur automatique à la création.
  const placeId = String(rewards?.google_review?.place_id ?? "").trim();
  if (placeId) {
    const existing = getLatestSnapshot(business.id, "google_review");
    if (!existing) {
      const bizId = business.id;
      setImmediate(() => { refreshGooglePlacesSnapshotFromPlaceId(bizId, placeId).catch(() => {}); });
    }
  }

  const summary = buildSocialMetricsSummary(business.id, rewards);
  return res.json(summary);
});

router.post("/social-metrics/refresh", refreshLimiter, async (req, res) => {
  const business = req.business;
  const rewards = getEngagementRewards(business.id);
  const gr = rewards.google_review;
  const placeId = String(gr?.place_id ?? "").trim();
  // `enabled` contrôle uniquement la récompense (points), pas l'affichage des métriques.
  const googleOk = !!placeId;
  const gbpConn = getSocialOAuthConnection(business.id, PROVIDER_GOOGLE_BUSINESS);
  const googleBusinessOk = !!(gbpConn?.access_token || gbpConn?.refresh_token);
  const metaIg = !!getSocialOAuthConnection(business.id, PROVIDER_META_INSTAGRAM);
  const youtubeOk = !!getSocialOAuthConnection(business.id, PROVIDER_GOOGLE_YOUTUBE);
  const tiktokOk = !!getSocialOAuthConnection(business.id, PROVIDER_TIKTOK);

  if (!googleOk && !googleBusinessOk && !metaIg && !youtubeOk && !tiktokOk) {
    return res.status(400).json({
      error:
        "Connectez au moins un réseau (Meta/Instagram, YouTube, TikTok), liez Google Business (avis), ou configurez le Place ID Google pour rafraîchir.",
    });
  }

  try {
    /** @type {Record<string, object>} */
    const refresh = {};
    let failed = false;

    if (googleOk || googleBusinessOk) {
      refresh.google = await refreshGoogleSnapshotForBusiness(business.id, placeId);
      if (!refresh.google?.ok) failed = true;
    }
    if (metaIg) {
      refresh.instagram = await refreshInstagramOAuthForBusiness(business.id);
      if (!refresh.instagram?.ok) failed = true;
      refresh.facebook = await refreshFacebookFanOAuthForBusiness(business.id);
      if (
        !refresh.facebook?.ok &&
        refresh.facebook?.error !== "no_facebook_page" &&
        refresh.facebook?.error !== "no_oauth"
      ) {
        failed = true;
      }
    }
    if (youtubeOk) {
      refresh.youtube = await refreshYouTubeOAuthForBusiness(business.id);
      if (!refresh.youtube?.ok) failed = true;
    }
    if (tiktokOk) {
      refresh.tiktok = await refreshTikTokOAuthForBusiness(business.id);
      if (!refresh.tiktok?.ok) failed = true;
    }

    const summary = buildSocialMetricsSummary(business.id, rewards);
    if (failed) {
      return res.status(502).json({
        error: "refresh_failed",
        ...summary,
        refresh,
      });
    }
    return res.json({ ...summary, refresh });
  } catch (e) {
    return res.status(500).json({ error: "Erreur lors du rafraîchissement." });
  }
});

/**
 * Désactivé par défaut : métriques issues des OAuth uniquement (SOCIAL_METRICS_ALLOW_MANUAL=true pour rétablir).
 */
router.post("/social-metrics/manual", (req, res) => {
  if (process.env.SOCIAL_METRICS_ALLOW_MANUAL !== "true") {
    return res.status(400).json({
      error: "saisie_manuelle_desactivee",
      hint: "Connectez les réseaux via OAuth ou définissez SOCIAL_METRICS_ALLOW_MANUAL=true (secours).",
    });
  }

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
