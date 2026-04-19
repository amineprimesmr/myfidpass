/**
 * Enregistre le topic Pub/Sub auprès de Google après OAuth GBP (My Business Notifications API).
 *
 * @module services/google-business-pubsub-register
 */
import logger from "../lib/logger.js";
import {
  enableNotifications,
  getConfiguredGbpPubSubTopic,
} from "./google-business-oauth.js";
import {
  patchSocialOAuthConnectionMetadata,
  PROVIDER_GOOGLE_BUSINESS,
} from "../db/social-oauth.js";

/**
 * @param {string} businessId
 * @param {string} accessToken
 * @param {string} accountId - identifiant nu (pas `accounts/…`)
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
export async function registerGbpPubSubIfConfigured(businessId, accessToken, accountId) {
  const topic = getConfiguredGbpPubSubTopic();
  if (!topic) {
    return { ok: true, skipped: true, reason: "no_topic_env" };
  }
  const tok = String(accessToken || "").trim();
  const aid = String(accountId || "").trim();
  if (!tok || !aid) {
    return { ok: false, skipped: true, error: "missing_token_or_account" };
  }
  try {
    const r = await enableNotifications(tok, aid, topic);
    if (!r.ok) {
      patchSocialOAuthConnectionMetadata(businessId, PROVIDER_GOOGLE_BUSINESS, {
        gbp_pubsub_error: String(r.error || "enable_failed").slice(0, 500),
      });
      logger.warn({ businessId, err: r.error }, "[gbp-pubsub] enableNotifications failed");
      return { ok: false, error: r.error };
    }
    patchSocialOAuthConnectionMetadata(businessId, PROVIDER_GOOGLE_BUSINESS, {
      gbp_pubsub_registered_at: new Date().toISOString(),
      gbp_pubsub_topic: topic,
      gbp_pubsub_error: null,
    });
    logger.info({ businessId, accountId: aid }, "[gbp-pubsub] Pub/Sub notifications enregistrées");
    return { ok: true };
  } catch (err) {
    logger.error({ err, businessId }, "[gbp-pubsub] register exception");
    patchSocialOAuthConnectionMetadata(businessId, PROVIDER_GOOGLE_BUSINESS, {
      gbp_pubsub_error: String(err?.message || "register_failed").slice(0, 500),
    });
    return { ok: false, error: err?.message || "register_failed" };
  }
}
