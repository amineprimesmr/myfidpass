/**
 * Callback OAuth Meta (Instagram) — public, sans JWT (redirect navigateur).
 * redirect_uri unique : /api/oauth/meta/callback (à déclarer sur l’app Meta).
 */
import { Router } from "express";
import { getBusinessById } from "../db.js";
import { upsertSocialOAuthConnection, PROVIDER_META_INSTAGRAM } from "../db/social-oauth.js";
import { insertSocialMetricSnapshot } from "../db/social-metrics.js";
import {
  verifyMetaOAuthState,
  exchangeAuthorizationCode,
  fetchInstagramBusinessFromUserToken,
  fetchFacebookPageFanCount,
  getDefaultMetaRedirectUri,
  isMetaOAuthConfigured,
} from "../services/meta-instagram-oauth.js";
import logger from "../lib/logger.js";

const router = Router();

function redirectToApp(query) {
  const u = new URL("myfidpass://oauth-meta");
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

router.get("/meta/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(302, redirectToApp({ error: String(error) }));
  }
  const redirectUri = getDefaultMetaRedirectUri();
  if (!isMetaOAuthConfigured() || !redirectUri) {
    return res.status(503).send("OAuth Meta non configuré (META_APP_ID / API_URL).");
  }
  const payload = verifyMetaOAuthState(String(state || ""));
  if (!payload) {
    return res.status(400).send("Session OAuth invalide ou expirée. Réessayez depuis l’app.");
  }
  const business = getBusinessById(payload.businessId);
  if (!business || String(business.slug || "").trim() !== payload.slug) {
    return res.status(400).send("Commerce invalide.");
  }
  const exchanged = await exchangeAuthorizationCode(String(code || ""), redirectUri);
  if (!exchanged.ok) {
    logger.warn({ err: exchanged.error }, "[oauth-meta] token exchange");
    return res.redirect(302, redirectToApp({ error: exchanged.error || "token" }));
  }
  const ig = await fetchInstagramBusinessFromUserToken(exchanged.accessToken);
  if (!ig.ok) {
    logger.warn({ err: ig.error }, "[oauth-meta] instagram");
    return res.redirect(302, redirectToApp({ error: ig.error || "instagram" }));
  }
  try {
    upsertSocialOAuthConnection({
      businessId: business.id,
      provider: PROVIDER_META_INSTAGRAM,
      accessToken: exchanged.accessToken,
      refreshToken: null,
      tokenExpiresAt: exchanged.expiresAt,
      externalUserId: ig.igUserId,
      metadata: {
        username: ig.username,
        facebook_page_id: ig.facebookPageId,
        page_name: ig.pageName,
      },
    });
    insertSocialMetricSnapshot(business.id, "instagram_follow", "oauth_meta", {
      followers: ig.followersCount,
    });
    if (ig.facebookPageId && ig.pageAccessToken) {
      const fb = await fetchFacebookPageFanCount(ig.facebookPageId, ig.pageAccessToken);
      if (fb.ok) {
        insertSocialMetricSnapshot(business.id, "facebook_follow", "oauth_meta", { followers: fb.fanCount });
      }
    }
  } catch (e) {
    logger.error({ err: e }, "[oauth-meta] persist");
    return res.redirect(302, redirectToApp({ error: "save_failed" }));
  }
  return res.redirect(302, redirectToApp({ success: "1" }));
});

export default router;
