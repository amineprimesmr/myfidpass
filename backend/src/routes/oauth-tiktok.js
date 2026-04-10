/**
 * Callback OAuth TikTok — myfidpass://oauth-tiktok
 */
import { Router } from "express";
import { getBusinessById } from "../db.js";
import { upsertSocialOAuthConnection, PROVIDER_TIKTOK } from "../db/social-oauth.js";
import { insertSocialMetricSnapshot } from "../db/social-metrics.js";
import {
  verifyTikTokOAuthState,
  exchangeTikTokAuthorizationCode,
  fetchTikTokUserStats,
  getTikTokRedirectUri,
  isTikTokOAuthConfigured,
} from "../services/tiktok-oauth.js";
import { syncEngagementUrlFromTikTokOAuth } from "../services/engagement-oauth-sync.js";
import logger from "../lib/logger.js";

const router = Router();

function redirectToApp(query) {
  const u = new URL("myfidpass://oauth-tiktok");
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

router.get("/tiktok/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(302, redirectToApp({ error: String(error) }));
  }
  const redirectUri = getTikTokRedirectUri();
  if (!isTikTokOAuthConfigured() || !redirectUri) {
    return res.status(503).send("OAuth TikTok non configuré (TIKTOK_CLIENT_KEY / SECRET / API_URL).");
  }
  const payload = verifyTikTokOAuthState(String(state || ""));
  if (!payload) {
    return res.status(400).send("Session OAuth invalide ou expirée.");
  }
  const business = getBusinessById(payload.businessId);
  if (!business || String(business.slug || "").trim() !== payload.slug) {
    return res.status(400).send("Commerce invalide.");
  }
  const exchanged = await exchangeTikTokAuthorizationCode(String(code || ""), redirectUri);
  if (!exchanged.ok) {
    logger.warn({ err: exchanged.error }, "[oauth-tiktok] token");
    return res.redirect(302, redirectToApp({ error: exchanged.error || "token" }));
  }
  const user = await fetchTikTokUserStats(exchanged.accessToken);
  if (!user.ok) {
    return res.redirect(302, redirectToApp({ error: user.error || "tiktok_user" }));
  }
  const openId = user.openId || exchanged.openId || "";
  try {
    upsertSocialOAuthConnection({
      businessId: business.id,
      provider: PROVIDER_TIKTOK,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      tokenExpiresAt: exchanged.expiresAt,
      externalUserId: openId,
      metadata: { username: user.username || "", display_name: "" },
    });
    insertSocialMetricSnapshot(business.id, "tiktok_follow", "oauth_tiktok", {
      followers: user.followerCount,
    });
    syncEngagementUrlFromTikTokOAuth(business.id, { username: user.username });
  } catch (e) {
    logger.error({ err: e }, "[oauth-tiktok] persist");
    return res.redirect(302, redirectToApp({ error: "save_failed" }));
  }
  return res.redirect(302, redirectToApp({ success: "1" }));
});

export default router;
