/**
 * Réception push Google Cloud Pub/Sub → sync avis + push APNs (via syncReviewsForBusiness).
 *
 * Configuration push recommandée :
 * - URL : `https://API/api/webhooks/gbp-pubsub?token=SECRET` avec `GBP_PUBSUB_WEBHOOK_SECRET=SECRET`
 * - Ou OIDC : `GBP_PUBSUB_VERIFY_OIDC=true` + `GBP_PUBSUB_PUSH_AUDIENCE=https://…/api/webhooks/gbp-pubsub`
 *
 * @module services/gbp-pubsub-push-handler
 */
import { OAuth2Client } from "google-auth-library";
import logger from "../lib/logger.js";
import { findBusinessIdsForGoogleLocation } from "../db/google-business.js";
import { syncReviewsForBusiness } from "./google-business-reviews-sync.js";

const oauth2Client = new OAuth2Client();

function webhookSecret() {
  return (process.env.GBP_PUBSUB_WEBHOOK_SECRET || process.env.GOOGLE_BUSINESS_PUBSUB_WEBHOOK_SECRET || "").trim();
}

function pubsubPushAudience() {
  return (process.env.GBP_PUBSUB_PUSH_AUDIENCE || "").trim();
}

/**
 * @param {Record<string, unknown>} obj
 */
export function normalizeGbpPubSubNotificationPayload(obj) {
  if (!obj || typeof obj !== "object") {
    return { type: null, reviewName: null, locationName: null };
  }
  const type = /** @type {string|null} */ (obj.type || obj.eventType || obj.notificationType || null);
  const reviewName = /** @type {string|null} */ (obj.reviewName || obj.review_name || obj.review || null);
  const locationName = /** @type {string|null} */ (obj.locationName || obj.location_name || obj.location || null);
  return {
    type: type ? String(type) : null,
    reviewName: reviewName ? String(reviewName) : null,
    locationName: locationName ? String(locationName) : null,
  };
}

/**
 * @param {{ reviewName: string|null, locationName: string|null }} p
 * @returns {{ accountId: string, locationId: string }|null}
 */
export function extractAccountLocationFromNotification(p) {
  let loc = p.locationName;
  if (!loc && p.reviewName) {
    const m = String(p.reviewName).match(/^(accounts\/[^/]+\/locations\/[^/]+)\/reviews\//);
    if (m) loc = m[1];
  }
  if (!loc) return null;
  const m = String(loc).match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
  if (!m) return null;
  return { accountId: m[1], locationId: m[2] };
}

/**
 * @param {import("express").Request} req
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
async function verifyPubSubPushAuth(req) {
  const secret = webhookSecret();
  if (secret) {
    const q = String(req.query?.token || "");
    if (q !== secret) {
      return { ok: false, status: 401, error: "unauthorized" };
    }
    return { ok: true };
  }

  const wantOidc = process.env.GBP_PUBSUB_VERIFY_OIDC === "true" || process.env.GBP_PUBSUB_VERIFY_OIDC === "1";
  const audience = pubsubPushAudience();
  const auth = req.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);

  if (wantOidc || (process.env.NODE_ENV === "production" && audience && m)) {
    if (!audience || !m) {
      return { ok: false, status: 401, error: "oidc_not_configured" };
    }
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: m[1],
        audience,
      });
      if (!ticket.getPayload()) {
        return { ok: false, status: 401, error: "invalid_token" };
      }
    } catch (err) {
      logger.warn({ err }, "[gbp-pubsub] OIDC verify failed");
      return { ok: false, status: 401, error: "invalid_token" };
    }
    return { ok: true };
  }

  if (process.env.NODE_ENV === "production") {
    logger.error("[gbp-pubsub] Production : définir GBP_PUBSUB_WEBHOOK_SECRET ou OIDC (GBP_PUBSUB_PUSH_AUDIENCE).");
    return { ok: false, status: 503, error: "webhook_auth_not_configured" };
  }

  logger.warn("[gbp-pubsub] Auth push désactivée (dev) — définir GBP_PUBSUB_WEBHOOK_SECRET en prod.");
  return { ok: true };
}

const REVIEW_SYNC_TYPES = new Set(["NEW_REVIEW", "UPDATED_REVIEW", "GOOGLE_UPDATE"]);

/**
 * @param {import("express").Request} req
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, businessesSynced?: number }>}
 */
export async function handleGbpPubSubPushRequest(req) {
  const v = await verifyPubSubPushAuth(req);
  if (!v.ok) return v;

  const envelope = req.body;
  if (!envelope || typeof envelope !== "object" || !envelope.message) {
    return { ok: false, status: 400, error: "invalid_envelope" };
  }

  const dataB64 = envelope.message.data;
  if (!dataB64 || typeof dataB64 !== "string") {
    return { ok: true, businessesSynced: 0 };
  }

  let json;
  try {
    json = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8"));
  } catch (err) {
    logger.warn({ err }, "[gbp-pubsub] payload base64/json invalide");
    return { ok: false, status: 400, error: "invalid_payload" };
  }

  const norm = normalizeGbpPubSubNotificationPayload(json);
  const ids = extractAccountLocationFromNotification(norm);
  if (!ids) {
    logger.info({ type: norm.type }, "[gbp-pubsub] notification sans lieu exploitable");
    return { ok: true, businessesSynced: 0 };
  }

  if (norm.type && !REVIEW_SYNC_TYPES.has(norm.type)) {
    return { ok: true, businessesSynced: 0 };
  }

  const businessIds = findBusinessIdsForGoogleLocation(ids.accountId, ids.locationId);
  if (!businessIds.length) {
    logger.info(
      { accountId: ids.accountId, locationId: ids.locationId, type: norm.type },
      "[gbp-pubsub] aucun commerce local pour ce lieu",
    );
    return { ok: true, businessesSynced: 0 };
  }

  let n = 0;
  for (const bid of businessIds) {
    try {
      const r = await syncReviewsForBusiness(bid, { notifyNew: true });
      if (r.ok) n += 1;
      else logger.warn({ businessId: bid, err: r.error }, "[gbp-pubsub] syncReviewsForBusiness");
    } catch (err) {
      logger.warn({ err, businessId: bid }, "[gbp-pubsub] sync exception");
    }
  }

  return { ok: true, businessesSynced: n };
}
