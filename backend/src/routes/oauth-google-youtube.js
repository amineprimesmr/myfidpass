/**
 * Callback OAuth Google (YouTube) — myfidpass://oauth-google-youtube
 */
import { Router } from "express";
import { getBusinessById } from "../db.js";
import { upsertSocialOAuthConnection, PROVIDER_GOOGLE_YOUTUBE } from "../db/social-oauth.js";
import { insertSocialMetricSnapshot } from "../db/social-metrics.js";
import {
  verifyYouTubeOAuthState,
  exchangeYouTubeAuthorizationCode,
  fetchYouTubeChannelStats,
  getYouTubeRedirectUri,
  isYouTubeOAuthConfigured,
} from "../services/google-youtube-oauth.js";
import { syncEngagementUrlFromYouTubeOAuth } from "../services/engagement-oauth-sync.js";
import { buildNativeOAuthReturnUrl } from "../lib/oauth-native-redirect.js";
import logger from "../lib/logger.js";

const router = Router();

function redirectToApp(query) {
  return buildNativeOAuthReturnUrl("google-youtube", query);
}

router.get("/google-youtube/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(302, redirectToApp({ error: String(error) }));
  }
  const redirectUri = getYouTubeRedirectUri();
  if (!isYouTubeOAuthConfigured() || !redirectUri) {
    return res.status(503).send("OAuth YouTube non configuré (GOOGLE_CLIENT_ID / SECRET / API_URL).");
  }
  const payload = verifyYouTubeOAuthState(String(state || ""));
  if (!payload) {
    return res.status(400).send("Session OAuth invalide ou expirée.");
  }
  const business = getBusinessById(payload.businessId);
  if (!business || String(business.slug || "").trim() !== payload.slug) {
    return res.status(400).send("Commerce invalide.");
  }
  const exchanged = await exchangeYouTubeAuthorizationCode(String(code || ""), redirectUri);
  if (!exchanged.ok) {
    logger.warn({ err: exchanged.error }, "[oauth-youtube] token");
    return res.redirect(302, redirectToApp({ error: exchanged.error || "token" }));
  }
  const stats = await fetchYouTubeChannelStats(exchanged.accessToken);
  if (!stats.ok) {
    return res.redirect(302, redirectToApp({ error: stats.error || "youtube" }));
  }
  try {
    upsertSocialOAuthConnection({
      businessId: business.id,
      provider: PROVIDER_GOOGLE_YOUTUBE,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      tokenExpiresAt: exchanged.expiresAt,
      externalUserId: stats.channelId,
      metadata: {
        channel_id: stats.channelId,
        channel_title: stats.channelTitle || "",
        custom_url: stats.customUrl || "",
      },
    });
    insertSocialMetricSnapshot(business.id, "youtube_follow", "oauth_google_youtube", {
      followers: stats.subscriberCount,
    });
    syncEngagementUrlFromYouTubeOAuth(business.id, {
      channelId: stats.channelId,
      customUrl: stats.customUrl,
    });
  } catch (e) {
    logger.error({ err: e }, "[oauth-youtube] persist");
    return res.redirect(302, redirectToApp({ error: "save_failed" }));
  }
  return res.redirect(302, redirectToApp({ success: "1" }));
});

export default router;
