/**
 * Sync des avis Google Business Profile + push APNs temps réel.
 *
 * Cron (10 min) :
 *   1. Pour chaque commerce avec une connexion GBP active
 *   2. Rafraîchit le token si nécessaire, résout la fiche si pending
 *   3. Pull reviews.list paginé (API v4)
 *   4. Upsert en DB, détecte les nouveaux (premier stockage)
 *   5. Pour chaque nouveau avis → push APNs visible au commerçant
 *   6. Snapshot social_metric_snapshots pour le dashboard agrégé
 *
 * @module services/google-business-reviews-sync
 */
import logger from "../lib/logger.js";
import {
  getSocialOAuthConnection,
  upsertSocialOAuthConnection,
  PROVIDER_GOOGLE_BUSINESS,
} from "../db/social-oauth.js";
import {
  listAllGoogleBusinessReviews,
  refreshGoogleBusinessAccessToken,
} from "./google-business-oauth.js";
import {
  upsertGoogleBusinessReview,
  markReviewNotified,
  listBusinessesWithGoogleBusinessOAuth,
  starRatingToNum,
} from "../db/google-business.js";
import { tryCompletePendingGoogleBusinessLocation } from "./social-metrics-service.js";
import { insertSocialMetricSnapshot, getLatestSnapshot } from "../db/social-metrics.js";
import { getMerchantDeviceTokensForUser, deleteMerchantPushDeviceByToken } from "../db/passes.js";
import { sendMerchantAppAlert, isLikelyInvalidDeviceTokenApnsError } from "../apns.js";
import { getDb } from "../db/connection.js";

const db = getDb();

function parseMetadata(conn) {
  if (!conn?.metadata) return {};
  try {
    return JSON.parse(conn.metadata) || {};
  } catch (_) {
    return {};
  }
}

/**
 * Retourne { businessId, accountId, locationId, accessToken, slug } si utilisable, sinon null.
 */
async function ensureReadyConnection(businessId) {
  let conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (!conn) return null;
  let meta = parseMetadata(conn);
  if (meta.location_pending) {
    await tryCompletePendingGoogleBusinessLocation(businessId);
    conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
    meta = parseMetadata(conn);
    if (meta.location_pending) return null;
  }
  const accountId = String(meta.account_id || "").trim();
  const locationId = String(meta.location_id || "").trim();
  if (!accountId || !locationId) return null;

  let accessToken = conn.access_token || "";
  const expAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : NaN;
  const needsRefresh = !accessToken || (Number.isFinite(expAt) && expAt - Date.now() < 120_000);
  if (needsRefresh && conn.refresh_token) {
    const r = await refreshGoogleBusinessAccessToken(conn.refresh_token);
    if (r.ok) {
      accessToken = r.accessToken;
      upsertSocialOAuthConnection({
        businessId,
        provider: PROVIDER_GOOGLE_BUSINESS,
        accessToken: r.accessToken,
        refreshToken: conn.refresh_token,
        tokenExpiresAt: r.expiresAt,
        externalUserId: conn.external_user_id,
        metadata: meta,
      });
    }
  }
  if (!accessToken) return null;

  return { accountId, locationId, accessToken };
}

function reviewExtract(rev) {
  const reviewer = rev.reviewer || {};
  const reviewReply = rev.reviewReply || null;
  const name = String(rev.name || "").trim();
  const parts = name.match(/accounts\/([^/]+)\/locations\/([^/]+)\/reviews\/([^/]+)$/);
  const reviewId = parts ? parts[3] : String(rev.reviewId || "").trim();
  return {
    reviewId,
    locationName: name.replace(/\/reviews\/.*$/, ""),
    rating: starRatingToNum(rev.starRating),
    authorName: String(reviewer.displayName || "").trim() || null,
    authorPhotoUrl: String(reviewer.profilePhotoUrl || "").trim() || null,
    comment: String(rev.comment || "").trim() || null,
    replyComment: reviewReply ? String(reviewReply.comment || "").trim() || null : null,
    replyUpdateTime: reviewReply ? String(reviewReply.updateTime || "").trim() || null : null,
    createTime: String(rev.createTime || "").trim() || null,
    updateTime: String(rev.updateTime || rev.createTime || "").trim() || null,
    raw: rev,
  };
}

function buildReviewPushPayload(extract) {
  const rating = Math.max(0, Math.min(5, Number(extract.rating) || 0));
  const stars = rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) : "";
  const author = extract.authorName || "Un client";
  const title = rating >= 4
    ? `${stars}  Nouvel avis ${rating}/5`
    : rating > 0
    ? `⚠️ Avis ${rating}/5 — à traiter`
    : "Nouvel avis Google";
  const rawText = (extract.comment || "").replace(/\s+/g, " ").trim();
  const body = rawText
    ? `${author} : « ${rawText.slice(0, 140)}${rawText.length > 140 ? "…" : ""} »`
    : `${author} a laissé un avis sur votre fiche Google Business.`;
  return {
    title,
    body,
    category: "GOOGLE_BUSINESS_REVIEW",
    data: {
      myfidpass_action: "google_business_review",
      review_id: extract.reviewId,
      rating: String(rating),
      author: author.slice(0, 64),
      is_negative: rating > 0 && rating <= 3 ? "1" : "0",
    },
  };
}

function getUserIdForBusiness(businessId) {
  const row = db.prepare("SELECT user_id FROM businesses WHERE id = ?").get(businessId);
  const u = row?.user_id;
  return u != null ? String(u).trim() || null : null;
}

async function pushNewReviewToMerchant(businessId, extract) {
  const userId = getUserIdForBusiness(businessId);
  if (!userId) return;
  const tokens = getMerchantDeviceTokensForUser(userId);
  if (!tokens?.length) return;
  const payload = buildReviewPushPayload(extract);
  for (const t of tokens) {
    try {
      const r = await sendMerchantAppAlert(t, payload);
      if (!r.sent && r.error && isLikelyInvalidDeviceTokenApnsError(r.error)) {
        deleteMerchantPushDeviceByToken(t);
      }
    } catch (err) {
      logger.warn({ err, businessId }, "[gbp-sync] push alert failed");
    }
  }
}

/**
 * Rafraîchit le snapshot global (social_metric_snapshots) si les totaux ont changé,
 * pour que le dashboard agrégé (GoogleReviewsCommerceDashboardView) reflète l'état à jour.
 */
function maybeUpdateAggregateSnapshot(businessId, totalCount, averageRating, samples) {
  const metrics = {
    reviews_count: Number(totalCount) || 0,
    rating: Number.isFinite(averageRating) ? averageRating : null,
    reviews_sample: JSON.stringify(samples.slice(0, 15)),
  };
  const latest = getLatestSnapshot(businessId, "google_review");
  let prev = null;
  if (latest) {
    try {
      prev = JSON.parse(latest.metrics_json || "{}");
    } catch (_) {
      prev = null;
    }
  }
  const same = prev &&
    Number(prev.reviews_count) === Number(metrics.reviews_count) &&
    Number(prev.rating) === Number(metrics.rating);
  if (!same) {
    insertSocialMetricSnapshot(businessId, "google_review", "oauth_google_business_sync", metrics);
  }
}

/**
 * Sync complet d'un commerce : pull reviews, upsert, push APNs pour nouveaux.
 * @returns {Promise<{ ok: boolean, newCount?: number, totalCount?: number, error?: string }>}
 */
export async function syncReviewsForBusiness(businessId, { notifyNew = true, isFirstSync = null } = {}) {
  const ctx = await ensureReadyConnection(businessId);
  if (!ctx) return { ok: false, error: "not_configured" };

  const firstSyncFlag = isFirstSync != null
    ? !!isFirstSync
    : (() => {
        const row = db.prepare(
          "SELECT COUNT(*) AS n FROM google_business_reviews WHERE business_id = ?",
        ).get(businessId);
        return Number(row?.n || 0) === 0;
      })();

  const res = await listAllGoogleBusinessReviews(ctx.accessToken, ctx.accountId, ctx.locationId);
  if (!res.ok) {
    logger.warn({ businessId, err: res.error }, "[gbp-sync] list failed");
    return { ok: false, error: res.error };
  }

  let newCount = 0;
  const samples = [];
  for (const rev of res.reviews) {
    const extract = reviewExtract(rev);
    if (!extract.reviewId) continue;
    const out = upsertGoogleBusinessReview({ businessId, ...extract });
    if (out.isNew && notifyNew && !firstSyncFlag) {
      newCount += 1;
      try {
        await pushNewReviewToMerchant(businessId, extract);
        markReviewNotified(businessId, extract.reviewId);
      } catch (err) {
        logger.warn({ err, businessId }, "[gbp-sync] push failed");
      }
    } else if (out.isNew && firstSyncFlag) {
      // Première synchro : on marque notified_at sans pousser, pour ne pas spammer.
      markReviewNotified(businessId, extract.reviewId);
    }
    samples.push({
      author: extract.authorName,
      text: extract.comment,
      rating: extract.rating,
      update_time: extract.updateTime,
    });
  }

  maybeUpdateAggregateSnapshot(businessId, res.totalCount ?? res.reviews.length, res.averageRating, samples);
  return {
    ok: true,
    newCount,
    totalCount: res.totalCount ?? res.reviews.length,
    averageRating: res.averageRating,
  };
}

/**
 * Cron : parcourt tous les businesses connectés, sync reviews.
 */
export async function syncAllGoogleBusinessReviews() {
  const list = listBusinessesWithGoogleBusinessOAuth();
  let ok = 0;
  let totalNew = 0;
  for (const b of list) {
    try {
      const res = await syncReviewsForBusiness(b.business_id, { notifyNew: true });
      if (res.ok) {
        ok += 1;
        totalNew += res.newCount || 0;
      }
    } catch (err) {
      logger.warn({ err, businessId: b.business_id }, "[gbp-sync] business failed");
    }
  }
  if (list.length > 0) {
    logger.info(
      { total: list.length, ok, totalNew },
      "[gbp-sync] cron complete",
    );
  }
  return { total: list.length, ok, totalNew };
}
