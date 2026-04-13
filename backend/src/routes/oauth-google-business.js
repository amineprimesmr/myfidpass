/**
 * Callback OAuth Google Business Profile (avis) — myfidpass://oauth-google-business
 */
import { Router } from "express";
import { getBusinessById, getEngagementRewards } from "../db.js";
import { upsertSocialOAuthConnection, PROVIDER_GOOGLE_BUSINESS } from "../db/social-oauth.js";
import { insertSocialMetricSnapshot } from "../db/social-metrics.js";
import {
  verifyGoogleBusinessOAuthState,
  exchangeGoogleBusinessAuthorizationCode,
  getGoogleBusinessRedirectUri,
  isGoogleBusinessOAuthConfigured,
  resolveGoogleBusinessLocation,
  listGoogleBusinessReviews,
} from "../services/google-business-oauth.js";
import { buildNativeOAuthReturnUrl } from "../lib/oauth-native-redirect.js";
import logger from "../lib/logger.js";

const router = Router();

function redirectToApp(query) {
  return buildNativeOAuthReturnUrl("google-business", query);
}

router.get("/google-business/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(302, redirectToApp({ error: String(error) }));
  }
  const redirectUri = getGoogleBusinessRedirectUri();
  if (!isGoogleBusinessOAuthConfigured() || !redirectUri) {
    return res.status(503).send("OAuth Google Business non configuré (GOOGLE_CLIENT_ID / SECRET / API_URL).");
  }
  const payload = verifyGoogleBusinessOAuthState(String(state || ""));
  if (!payload) {
    return res.status(400).send("Session OAuth invalide ou expirée.");
  }
  const business = getBusinessById(payload.businessId);
  if (!business || String(business.slug || "").trim() !== payload.slug) {
    return res.status(400).send("Commerce invalide.");
  }
  const exchanged = await exchangeGoogleBusinessAuthorizationCode(String(code || ""), redirectUri);
  if (!exchanged.ok) {
    logger.warn({ err: exchanged.error }, "[oauth-gbp] token");
    return res.redirect(302, redirectToApp({ error: exchanged.error || "token" }));
  }

  const rewards = getEngagementRewards(business.id);
  const placeId = String(rewards?.google_review?.place_id ?? "").trim();

  const resolved = await resolveGoogleBusinessLocation(exchanged.accessToken, placeId);
  if (!resolved.ok) {
    logger.warn({ err: resolved.error }, "[oauth-gbp] resolve location");
    return res.redirect(302, redirectToApp({ error: resolved.error || "location" }));
  }

  try {
    upsertSocialOAuthConnection({
      businessId: business.id,
      provider: PROVIDER_GOOGLE_BUSINESS,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      tokenExpiresAt: exchanged.expiresAt,
      externalUserId: resolved.locationName,
      metadata: {
        account_id: resolved.accountId,
        location_id: resolved.locationId,
        location_title: resolved.title,
        matched_place_id: resolved.matchedPlaceId,
      },
    });

    const rev = await listGoogleBusinessReviews(
      exchanged.accessToken,
      resolved.accountId,
      resolved.locationId,
    );
    if (rev.ok) {
      insertSocialMetricSnapshot(business.id, "google_review", "oauth_google_business", {
        reviews_count: rev.reviewsCount,
        rating: rev.rating,
        reviews_sample: JSON.stringify(rev.samples),
      });
    }
  } catch (e) {
    logger.error({ err: e }, "[oauth-gbp] persist");
    return res.redirect(302, redirectToApp({ error: "save_failed" }));
  }
  return res.redirect(302, redirectToApp({ success: "1" }));
});

export default router;
