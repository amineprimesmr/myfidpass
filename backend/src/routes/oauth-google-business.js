/**
 * Callback OAuth Google Business Profile (avis) — myfidpass://oauth-google-business
 */
import { Router } from "express";
import { getBusinessById, getEngagementRewards } from "../db.js";
import { upsertSocialOAuthConnection, PROVIDER_GOOGLE_BUSINESS } from "../db/social-oauth.js";
import {
  verifyGoogleBusinessOAuthState,
  exchangeGoogleBusinessAuthorizationCode,
  getGoogleBusinessRedirectUri,
  isGoogleBusinessOAuthConfigured,
  resolveGoogleBusinessLocation,
} from "../services/google-business-oauth.js";
import { syncReviewsForBusiness } from "../services/google-business-reviews-sync.js";
import { buildNativeOAuthReturnUrl } from "../lib/oauth-native-redirect.js";
import { registerGbpPubSubIfConfigured } from "../services/google-business-pubsub-register.js";
import logger from "../lib/logger.js";

const router = Router();

function redirectToApp(query) {
  return buildNativeOAuthReturnUrl("google-business", query);
}

/**
 * Les erreurs Google complètes (plusieurs Ko, caractères spéciaux) cassent souvent l’URL de redirect
 * → Safari / ASWebAuthenticationSession reste en chargement infini. On renvoie des codes courts.
 * @param {string} raw
 */
function compactOAuthAppError(raw) {
  const s = String(raw || "").trim();
  if (!s) return "unknown";
  const low = s.toLowerCase();
  if (low.includes("quota exceeded") || low.includes("resource exhausted") || low.includes("rate_limit")) {
    return "google_api_quota";
  }
  if (low.includes("permission_denied") || (low.includes("insufficient") && low.includes("permission"))) {
    return "google_api_permission";
  }
  if (low.includes("timeout") || s === "timeout") return "timeout";
  if (s.length <= 100 && !/[&=\r\n]/.test(s)) return s;
  return "google_api_error";
}

/** Quota / surcharge / timeout : on garde les tokens et on finalise la fiche plus tard (refresh). */
function isRetryableGoogleBusinessResolveError(raw) {
  const low = String(raw || "").toLowerCase();
  return (
    low.includes("quota exceeded") ||
    low.includes("resource exhausted") ||
    low.includes("rate_limit") ||
    low.includes("rate limit") ||
    low.includes("too many requests") ||
    String(raw || "") === "timeout"
  );
}

router.get("/google-business/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(302, redirectToApp({ error: compactOAuthAppError(String(error)) }));
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
      return res.redirect(302, redirectToApp({ error: compactOAuthAppError(exchanged.error || "token") }));
    }

    const rewards = getEngagementRewards(business.id);
    const placeId = String(rewards?.google_review?.place_id ?? "").trim();

    const resolved = await resolveGoogleBusinessLocation(exchanged.accessToken, placeId);
    if (!resolved.ok) {
      logger.warn({ err: resolved.error }, "[oauth-gbp] resolve location");
      if (isRetryableGoogleBusinessResolveError(resolved.error)) {
        try {
          upsertSocialOAuthConnection({
            businessId: business.id,
            provider: PROVIDER_GOOGLE_BUSINESS,
            accessToken: exchanged.accessToken,
            refreshToken: exchanged.refreshToken,
            tokenExpiresAt: exchanged.expiresAt,
            externalUserId: "pending:location",
            metadata: {
              location_pending: true,
              last_resolve_error: compactOAuthAppError(resolved.error || "location"),
              pending_since: new Date().toISOString(),
              preferred_place_id: placeId || null,
            },
          });
          logger.info({ businessId: business.id }, "[oauth-gbp] tokens saved; location resolve deferred (retryable error)");
        } catch (e) {
          logger.error({ err: e }, "[oauth-gbp] persist pending");
          return res.redirect(302, redirectToApp({ error: "save_failed" }));
        }
        return res.redirect(302, redirectToApp({ success: "1", gbp_pending: "1" }));
      }
      return res.redirect(302, redirectToApp({ error: compactOAuthAppError(resolved.error || "location") }));
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
    } catch (e) {
      logger.error({ err: e }, "[oauth-gbp] persist");
      return res.redirect(302, redirectToApp({ error: "save_failed" }));
    }

    /**
     * Ne pas bloquer la redirection utilisateur (Safari / ASWebAuthenticationSession reste en chargement
     * si on attend la réponse HTTP). Sync complète en arrière-plan : les avis sont visibles dans l'app
     * dès que l'utilisateur ouvre le hub, sans attendre le prochain passage du cron.
     */
    const bid = business.id;
    const tok = exchanged.accessToken;
    const aid = resolved.accountId;
    setImmediate(() => {
      // Sync complète : upsert avis individuels en DB + snapshot agrégé. isFirstSync=true → pas de push
      // pour les avis déjà existants (évite de spammer le commerçant avec 40 notifications d'un coup).
      syncReviewsForBusiness(bid, { notifyNew: false, isFirstSync: true })
        .then((r) => logger.info({ businessId: bid, ...r }, "[oauth-gbp] initial sync complete"))
        .catch((err) => logger.warn({ err, businessId: bid }, "[oauth-gbp] initial sync failed"));
      registerGbpPubSubIfConfigured(bid, tok, aid).catch((err) =>
        logger.warn({ err, businessId: bid }, "[oauth-gbp] pubsub register"),
      );
    });

    return res.redirect(302, redirectToApp({ success: "1" }));
  } catch (e) {
    logger.error({ err: e }, "[oauth-gbp] unhandled");
    return res.redirect(302, redirectToApp({ error: "callback_failed" }));
  }
});

export default router;
