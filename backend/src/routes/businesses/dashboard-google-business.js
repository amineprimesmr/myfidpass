/**
 * Routes Google Business Profile (Phase 1-3) — montées sous /api/businesses/:slug/dashboard/google-business.
 *
 * Couvre :
 *  - Avis (list, reply, delete-reply, reply-ai, star, archive, seen)
 *  - Local posts (list, create, delete)
 *  - Q&A (list, answer)
 *  - Insights / performance (vues, clics, appels, itinéraires)
 *  - Informations fiche + horaires (read + patch)
 *  - Médias / photos (list, create via URL, delete)
 *
 * Tous les endpoints supposent le middleware `requireDashboard` déjà appliqué au parent.
 *
 * @module routes/businesses/dashboard-google-business
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getSocialOAuthConnection,
  upsertSocialOAuthConnection,
  parseSocialOAuthMetadata,
  patchSocialOAuthConnectionMetadata,
  PROVIDER_GOOGLE_BUSINESS,
} from "../../db/social-oauth.js";
import {
  refreshGoogleBusinessAccessToken,
  updateReviewReply,
  deleteReviewReply,
  listLocalPosts,
  createLocalPost,
  deleteLocalPost,
  listQuestions,
  upsertOwnerAnswer,
  deleteOwnerAnswer,
  fetchDailyMetricsTimeSeries,
  getLocationInfo,
  patchLocationInfo,
  listMedia,
  createMediaFromSourceUrl,
  deleteMedia,
  listGoogleBusinessLocations,
  listGoogleBusinessAccounts,
  listAllGoogleBusinessLocationsFlat,
  accountResourceIdFromName,
} from "../../services/google-business-oauth.js";
import { tryCompletePendingGoogleBusinessLocation } from "../../services/social-metrics-service.js";
import { syncReviewsForBusiness } from "../../services/google-business-reviews-sync.js";
import { registerGbpPubSubIfConfigured } from "../../services/google-business-pubsub-register.js";
import { generateReviewReply } from "../../services/google-business-reply-ai.js";
import {
  listGoogleBusinessReviews,
  countGoogleBusinessReviews,
  getGoogleBusinessReviewById,
  setReviewReply,
  setReviewStarred,
  setReviewArchived,
  markReviewSeenByMerchant,
  markAllReviewsSeenByMerchant,
  replaceGoogleBusinessPosts,
  listGoogleBusinessPosts,
  deleteGoogleBusinessPost,
  replaceGoogleBusinessQuestions,
  listGoogleBusinessQuestions,
  getGoogleBusinessQuestion,
  setInsightsCache,
  getInsightsCache,
  setLocationCache,
  getLocationCache,
  replaceGoogleBusinessMedia,
  listGoogleBusinessMedia,
} from "../../db/google-business.js";
import logger from "../../lib/logger.js";

const router = Router({ mergeParams: true });

// ─────────────────────────── Helpers ───────────────────────────

function parseMetadata(conn) {
  return parseSocialOAuthMetadata(conn);
}

/**
 * Résout un accessToken frais + (accountId, locationId) pour req.business.
 * Renvoie null + écrit 409 / 503 si non configuré.
 */
async function requireGoogleBusinessContext(req, res) {
  const businessId = req.business.id;
  let conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (!conn) {
    res.status(409).json({ error: "google_business_not_connected" });
    return null;
  }
  let meta = parseMetadata(conn);
  if (meta.location_pending) {
    await tryCompletePendingGoogleBusinessLocation(businessId);
    conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
    meta = parseMetadata(conn);
  }
  const accountId = String(meta.account_id || "").trim();
  const locationId = String(meta.location_id || "").trim();
  if (!accountId || !locationId) {
    res.status(409).json({ error: "location_pending" });
    return null;
  }
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
  if (!accessToken) {
    res.status(401).json({ error: "token_refresh_failed" });
    return null;
  }
  return { accountId, locationId, accessToken, locationTitle: meta.location_title || "", businessId };
}

function serializeReviewRow(r) {
  if (!r) return null;
  return {
    review_id: r.review_id,
    location_name: r.location_name,
    rating: Number(r.rating) || 0,
    author_name: r.author_name,
    author_photo_url: r.author_photo_url,
    comment: r.comment,
    reply_comment: r.reply_comment,
    reply_update_time: r.reply_update_time,
    create_time: r.create_time,
    update_time: r.update_time,
    first_seen_at: r.first_seen_at,
    starred: !!r.starred,
    archived: !!r.archived,
    seen_by_merchant: !!r.seen_by_merchant_at,
  };
}

function serializePost(p) {
  return {
    post_id: p.post_id,
    name: p.name,
    topic_type: p.topic_type,
    summary: p.summary,
    language_code: p.language_code,
    media_url: p.media_url,
    cta_type: p.cta_type,
    cta_url: p.cta_url,
    event_title: p.event_title,
    event_start: p.event_start,
    event_end: p.event_end,
    offer_coupon: p.offer_coupon,
    offer_redeem_online_url: p.offer_redeem_online_url,
    offer_terms: p.offer_terms,
    state: p.state,
    create_time: p.create_time,
    update_time: p.update_time,
    search_url: p.search_url,
  };
}

function serializeQuestion(q) {
  return {
    question_id: q.question_id,
    name: q.name,
    text: q.text,
    author_name: q.author_name,
    author_photo_url: q.author_photo_url,
    author_is_owner: !!q.author_is_owner,
    upvote_count: Number(q.upvote_count || 0),
    total_answer_count: Number(q.total_answer_count || 0),
    top_answer_text: q.top_answer_text,
    top_answer_author: q.top_answer_author,
    top_answer_update_time: q.top_answer_update_time,
    create_time: q.create_time,
    update_time: q.update_time,
    answered_by_owner: !!q.answered_by_owner,
  };
}

function serializeMedia(m) {
  return {
    media_id: m.media_id,
    name: m.name,
    media_format: m.media_format,
    category: m.category,
    google_url: m.google_url,
    thumbnail_url: m.thumbnail_url,
    create_time: m.create_time,
  };
}

const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `gbp:${req.business?.id ?? req.ip}`,
  message: { error: "Trop de requêtes Google Business. Patientez une minute." },
});

const aiReplyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `gbp-ai:${req.business?.id ?? req.ip}`,
  message: { error: "Trop de générations IA. Patientez une minute." },
});

router.use("/google-business", heavyLimiter);

// ─────────────────────────── STATUS ───────────────────────────

/** Ré-enregistre le topic Pub/Sub côté Google (après changement d’URL serveur ou échec transitoire). */
router.post("/google-business/notifications/pubsub/register", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  try {
    const r = await registerGbpPubSubIfConfigured(ctx.businessId, ctx.accessToken, ctx.accountId);
    if (r.skipped && r.reason === "no_topic_env") {
      return res.status(503).json({
        error: "pubsub_topic_not_configured",
        message: "Variable serveur GOOGLE_BUSINESS_PUBSUB_TOPIC (ou GBP_PUBSUB_TOPIC) non définie.",
      });
    }
    if (r.skipped) {
      return res.status(400).json({ error: r.error || "skipped" });
    }
    if (!r.ok) return res.status(502).json({ error: r.error || "register_failed" });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[gbp-routes] pubsub register");
    return res.status(500).json({ error: "register_failed" });
  }
});

/**
 * Retente la résolution de fiche quand location_pending=true.
 * Appelé explicitement par le bouton "Actualiser" de la bannière pending (ne pas bloquer sur /status).
 */
router.post("/google-business/retry-pending-location", async (req, res) => {
  const businessId = req.business.id;
  const conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (!conn) return res.status(409).json({ error: "google_business_not_connected" });

  const meta = parseMetadata(conn);
  if (!meta.location_pending) {
    // Already resolved — return current status immediately
    const counts = countGoogleBusinessReviews(businessId);
    return res.json({ ok: true, resolved: true, location_pending: false, location_title: meta.location_title || null, counts });
  }

  // force=true bypasses the 5-min cooldown — this is an explicit user action
  const result = await tryCompletePendingGoogleBusinessLocation(businessId, { force: true });
  const updatedConn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  const updatedMeta = parseMetadata(updatedConn);
  const counts = countGoogleBusinessReviews(businessId);
  return res.json({
    ok: result.ok,
    resolved: result.ok,
    location_pending: !!updatedMeta.location_pending,
    location_title: updatedMeta.location_title || null,
    last_error: result.ok ? null : (result.error || "resolve_failed"),
    counts,
  });
});

router.get("/google-business/status", (req, res) => {
  const conn = getSocialOAuthConnection(req.business.id, PROVIDER_GOOGLE_BUSINESS);
  const meta = parseMetadata(conn);
  const counts = countGoogleBusinessReviews(req.business.id);
  const pubsubRegisteredAt = meta.gbp_pubsub_registered_at ? String(meta.gbp_pubsub_registered_at) : null;
  const pubsubErr = meta.gbp_pubsub_error ? String(meta.gbp_pubsub_error) : null;
  return res.json({
    connected: !!(conn?.access_token || conn?.refresh_token),
    location_pending: !!meta.location_pending,
    location_title: meta.location_title || null,
    account_id: meta.account_id || null,
    location_id: meta.location_id || null,
    matched_place_id: meta.matched_place_id || null,
    pubsub_live_notifications: !!pubsubRegisteredAt && !pubsubErr,
    pubsub_registered_at: pubsubRegisteredAt,
    pubsub_last_error: pubsubErr,
    counts,
  });
});

// ─────────────────────────── REVIEWS ───────────────────────────

router.get("/google-business/reviews", (req, res) => {
  const sort = String(req.query.sort || "recent");
  const min = req.query.min_rating ? Number(req.query.min_rating) : null;
  const max = req.query.max_rating ? Number(req.query.max_rating) : null;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;
  const includeArchived = String(req.query.include_archived || "") === "1";
  const rows = listGoogleBusinessReviews(req.business.id, {
    sort,
    minRating: min,
    maxRating: max,
    limit,
    offset,
    includeArchived,
  });
  const counts = countGoogleBusinessReviews(req.business.id);
  return res.json({
    reviews: rows.map(serializeReviewRow),
    counts,
  });
});

/* Cooldown par business pour /reviews/sync : max 1 sync Google toutes les 90 s.
 * Évite la rafale de requêtes Google quand le commerçant appuie plusieurs fois sur "Actualiser". */
const _syncLastAt = new Map();
const SYNC_COOLDOWN_MS = 90_000;

router.post("/google-business/reviews/sync", async (req, res) => {
  const businessId = req.business.id;
  const now = Date.now();
  const lastAt = _syncLastAt.get(businessId) ?? 0;
  const remaining = SYNC_COOLDOWN_MS - (now - lastAt);
  if (remaining > 0) {
    const counts = countGoogleBusinessReviews(businessId);
    return res.json({ ok: true, throttled: true, retry_after_ms: remaining, new_count: 0, total_count: counts.total ?? 0, counts });
  }
  _syncLastAt.set(businessId, now);
  try {
    const r = await syncReviewsForBusiness(businessId, { notifyNew: false });
    if (!r.ok) {
      _syncLastAt.delete(businessId);
      return res.status(502).json({ error: r.error || "sync_failed" });
    }
    const counts = countGoogleBusinessReviews(businessId);
    return res.json({ ok: true, new_count: r.newCount, total_count: r.totalCount, counts });
  } catch (err) {
    _syncLastAt.delete(businessId);
    logger.error({ err }, "[gbp-routes] sync");
    return res.status(500).json({ error: "sync_failed" });
  }
});

router.post("/google-business/reviews/mark-all-seen", (req, res) => {
  markAllReviewsSeenByMerchant(req.business.id);
  return res.json({ ok: true });
});

router.post("/google-business/reviews/:reviewId/seen", (req, res) => {
  markReviewSeenByMerchant(req.business.id, String(req.params.reviewId));
  return res.json({ ok: true });
});

router.post("/google-business/reviews/:reviewId/star", (req, res) => {
  const starred = req.body?.starred !== false;
  setReviewStarred(req.business.id, String(req.params.reviewId), starred);
  return res.json({ ok: true, starred });
});

router.post("/google-business/reviews/:reviewId/archive", (req, res) => {
  const archived = req.body?.archived !== false;
  setReviewArchived(req.business.id, String(req.params.reviewId), archived);
  return res.json({ ok: true, archived });
});

router.post("/google-business/reviews/:reviewId/reply", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const reviewId = String(req.params.reviewId);
  const comment = String(req.body?.comment || "").trim();
  if (!comment) return res.status(400).json({ error: "empty_comment" });
  if (comment.length > 4000) return res.status(400).json({ error: "comment_too_long" });
  const resource = `accounts/${ctx.accountId}/locations/${ctx.locationId}/reviews/${reviewId}`;
  const r = await updateReviewReply(ctx.accessToken, resource, comment);
  if (!r.ok) return res.status(502).json({ error: r.error });
  setReviewReply(req.business.id, reviewId, r.replyComment, r.replyUpdateTime);
  const row = getGoogleBusinessReviewById(req.business.id, reviewId);
  return res.json({ ok: true, review: serializeReviewRow(row) });
});

router.delete("/google-business/reviews/:reviewId/reply", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const reviewId = String(req.params.reviewId);
  const resource = `accounts/${ctx.accountId}/locations/${ctx.locationId}/reviews/${reviewId}`;
  const r = await deleteReviewReply(ctx.accessToken, resource);
  if (!r.ok) return res.status(502).json({ error: r.error });
  setReviewReply(req.business.id, reviewId, null, null);
  const row = getGoogleBusinessReviewById(req.business.id, reviewId);
  return res.json({ ok: true, review: serializeReviewRow(row) });
});

router.post("/google-business/reviews/:reviewId/reply-ai", aiReplyLimiter, async (req, res) => {
  const reviewId = String(req.params.reviewId);
  const row = getGoogleBusinessReviewById(req.business.id, reviewId);
  if (!row) return res.status(404).json({ error: "review_not_found" });
  const tone = String(req.body?.tone || "warm");
  const extraContext = String(req.body?.extra_context || "").slice(0, 500);
  const businessName = String(req.business.name || "").trim();
  try {
    const r = await generateReviewReply({ review: row, businessName, tone, extraContext });
    return res.json({ ok: true, reply: r.reply, source: r.source });
  } catch (err) {
    logger.error({ err }, "[gbp-routes] reply-ai");
    return res.status(500).json({ error: "ai_failed" });
  }
});

// ─────────────────────────── LOCAL POSTS ───────────────────────────

function mapLocalPostFromApi(p) {
  const name = String(p.name || "");
  const postId = name.split("/").pop() || String(p.postId || "");
  const event = p.event || {};
  const offer = p.offer || {};
  const media = Array.isArray(p.media) ? p.media[0] : null;
  const cta = p.callToAction || {};
  return {
    postId,
    name,
    topicType: String(p.topicType || "STANDARD"),
    summary: String(p.summary || "").trim(),
    languageCode: String(p.languageCode || "fr"),
    mediaUrl: media ? String(media.googleUrl || media.sourceUrl || "") : null,
    ctaType: cta.actionType ? String(cta.actionType) : null,
    ctaUrl: cta.url ? String(cta.url) : null,
    eventTitle: event.title ? String(event.title) : null,
    eventStart: event?.schedule?.startDate
      ? `${event.schedule.startDate.year}-${String(event.schedule.startDate.month).padStart(2, "0")}-${String(event.schedule.startDate.day).padStart(2, "0")}`
      : null,
    eventEnd: event?.schedule?.endDate
      ? `${event.schedule.endDate.year}-${String(event.schedule.endDate.month).padStart(2, "0")}-${String(event.schedule.endDate.day).padStart(2, "0")}`
      : null,
    offerCoupon: offer.couponCode || null,
    offerRedeemOnlineUrl: offer.redeemOnlineUrl || null,
    offerTerms: offer.termsConditions || null,
    state: String(p.state || ""),
    createTime: String(p.createTime || ""),
    updateTime: String(p.updateTime || ""),
    searchUrl: String(p.searchUrl || ""),
    raw: p,
  };
}

router.get("/google-business/posts", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const r = await listLocalPosts(ctx.accessToken, ctx.accountId, ctx.locationId);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const mapped = r.posts.map(mapLocalPostFromApi);
  replaceGoogleBusinessPosts(req.business.id, mapped);
  return res.json({ posts: listGoogleBusinessPosts(req.business.id).map(serializePost) });
});

router.post("/google-business/posts", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const body = req.body || {};
  const summary = String(body.summary || "").trim();
  if (!summary) return res.status(400).json({ error: "summary_required" });
  if (summary.length > 1500) return res.status(400).json({ error: "summary_too_long" });
  const topicType = String(body.topic_type || "STANDARD").toUpperCase();
  const validTopic = ["STANDARD", "EVENT", "OFFER", "ALERT"].includes(topicType) ? topicType : "STANDARD";
  /** @type {Record<string, unknown>} */
  const payload = {
    languageCode: String(body.language_code || "fr"),
    summary,
    topicType: validTopic,
  };
  if (body.media_url) {
    payload.media = [{ mediaFormat: "PHOTO", sourceUrl: String(body.media_url) }];
  }
  if (body.cta_type && body.cta_url) {
    payload.callToAction = {
      actionType: String(body.cta_type).toUpperCase(),
      url: String(body.cta_url),
    };
  }
  if (validTopic === "EVENT" && body.event_title && body.event_start && body.event_end) {
    const parseD = (s) => {
      const [y, m, d] = String(s).split("-").map((n) => Number(n));
      return { year: y, month: m, day: d };
    };
    payload.event = {
      title: String(body.event_title),
      schedule: {
        startDate: parseD(body.event_start),
        endDate: parseD(body.event_end),
      },
    };
  }
  if (validTopic === "OFFER" && body.offer_coupon) {
    payload.offer = {
      couponCode: String(body.offer_coupon),
      redeemOnlineUrl: body.offer_redeem_online_url ? String(body.offer_redeem_online_url) : undefined,
      termsConditions: body.offer_terms ? String(body.offer_terms) : undefined,
    };
  }
  const r = await createLocalPost(ctx.accessToken, ctx.accountId, ctx.locationId, payload);
  if (!r.ok) return res.status(502).json({ error: r.error });
  // On fait un refetch complet pour avoir la liste à jour
  const listR = await listLocalPosts(ctx.accessToken, ctx.accountId, ctx.locationId);
  if (listR.ok) replaceGoogleBusinessPosts(req.business.id, listR.posts.map(mapLocalPostFromApi));
  return res.json({
    ok: true,
    post: serializePost(mapLocalPostFromApi(r.post)),
    posts: listGoogleBusinessPosts(req.business.id).map(serializePost),
  });
});

router.delete("/google-business/posts/:postId", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const postId = String(req.params.postId);
  const resource = `accounts/${ctx.accountId}/locations/${ctx.locationId}/localPosts/${postId}`;
  const r = await deleteLocalPost(ctx.accessToken, resource);
  if (!r.ok) return res.status(502).json({ error: r.error });
  deleteGoogleBusinessPost(req.business.id, postId);
  return res.json({ ok: true });
});

// ─────────────────────────── Q & A ───────────────────────────

function mapQuestionFromApi(q) {
  const name = String(q.name || "");
  const questionId = name.split("/").pop();
  const author = q.author || {};
  const topAnswer = Array.isArray(q.topAnswers) ? q.topAnswers[0] : null;
  const topAuthor = topAnswer?.author || {};
  const ownerAnswered = Array.isArray(q.topAnswers) &&
    q.topAnswers.some((a) => String(a?.author?.type || "").toUpperCase() === "MERCHANT");
  return {
    questionId,
    name,
    text: String(q.text || ""),
    authorName: String(author.displayName || ""),
    authorPhotoUrl: String(author.profilePhotoUri || ""),
    authorIsOwner: String(author.type || "").toUpperCase() === "MERCHANT",
    upvoteCount: Number(q.upvoteCount || 0),
    totalAnswerCount: Number(q.totalAnswerCount || 0),
    topAnswerText: topAnswer ? String(topAnswer.text || "") : null,
    topAnswerAuthor: topAnswer ? String(topAuthor.displayName || "") : null,
    topAnswerUpdateTime: topAnswer ? String(topAnswer.updateTime || "") : null,
    createTime: String(q.createTime || ""),
    updateTime: String(q.updateTime || ""),
    answeredByOwner: ownerAnswered,
    raw: q,
  };
}

router.get("/google-business/questions", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const r = await listQuestions(ctx.accessToken, ctx.locationId);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const mapped = r.questions.map(mapQuestionFromApi);
  replaceGoogleBusinessQuestions(req.business.id, mapped);
  return res.json({ questions: listGoogleBusinessQuestions(req.business.id).map(serializeQuestion) });
});

router.post("/google-business/questions/:questionId/answer", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const questionId = String(req.params.questionId);
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty_answer" });
  if (text.length > 4000) return res.status(400).json({ error: "answer_too_long" });
  const resource = `locations/${ctx.locationId}/questions/${questionId}`;
  const r = await upsertOwnerAnswer(ctx.accessToken, resource, text);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const listR = await listQuestions(ctx.accessToken, ctx.locationId);
  if (listR.ok) replaceGoogleBusinessQuestions(req.business.id, listR.questions.map(mapQuestionFromApi));
  const row = getGoogleBusinessQuestion(req.business.id, questionId);
  return res.json({ ok: true, question: row ? serializeQuestion(row) : null });
});

router.delete("/google-business/questions/:questionId/answer", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const questionId = String(req.params.questionId);
  const resource = `locations/${ctx.locationId}/questions/${questionId}`;
  const r = await deleteOwnerAnswer(ctx.accessToken, resource);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const listR = await listQuestions(ctx.accessToken, ctx.locationId);
  if (listR.ok) replaceGoogleBusinessQuestions(req.business.id, listR.questions.map(mapQuestionFromApi));
  return res.json({ ok: true });
});

// ─────────────────────────── INSIGHTS / PERFORMANCE ───────────────────────────

function dateAgo(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const INSIGHTS_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
];

router.get("/google-business/insights", async (req, res) => {
  const forceFresh = String(req.query.fresh || "") === "1";
  if (!forceFresh) {
    const cached = getInsightsCache(req.business.id, 3600);
    if (cached) return res.json({ cached: true, ...cached });
  }
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const days = Math.max(7, Math.min(90, Number(req.query.days) || 30));
  const end = dateAgo(1);
  const start = dateAgo(days);
  const r = await fetchDailyMetricsTimeSeries(ctx.accessToken, ctx.locationId, INSIGHTS_METRICS, start, end);
  if (!r.ok) return res.status(502).json({ error: r.error });

  /** @type {Record<string, { total: number, series: Array<{ date: string, value: number }> }>} */
  const by = {};
  for (const s of r.series) {
    const metric = String(s.dailyMetric || "");
    const points = Array.isArray(s?.timeSeries?.datedValues) ? s.timeSeries.datedValues : [];
    const series = points.map((p) => {
      const d = p.date || {};
      const iso = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      return { date: iso, value: Number(p.value || 0) };
    });
    const total = series.reduce((a, b) => a + b.value, 0);
    by[metric] = { total, series };
  }

  const sumImpressions = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]
    .reduce((a, k) => a + (by[k]?.total || 0), 0);

  const summary = {
    days,
    impressions_total: sumImpressions,
    impressions_maps: (by.BUSINESS_IMPRESSIONS_DESKTOP_MAPS?.total || 0) + (by.BUSINESS_IMPRESSIONS_MOBILE_MAPS?.total || 0),
    impressions_search: (by.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH?.total || 0) + (by.BUSINESS_IMPRESSIONS_MOBILE_SEARCH?.total || 0),
    calls: by.CALL_CLICKS?.total || 0,
    website_clicks: by.WEBSITE_CLICKS?.total || 0,
    directions: by.BUSINESS_DIRECTION_REQUESTS?.total || 0,
    conversations: by.BUSINESS_CONVERSATIONS?.total || 0,
    bookings: by.BUSINESS_BOOKINGS?.total || 0,
  };

  const payload = { summary, metrics: by, generated_at: new Date().toISOString() };
  setInsightsCache(req.business.id, payload);
  return res.json({ cached: false, ...payload });
});

// ─────────────────────────── LOCATION INFO / HOURS ───────────────────────────

router.get("/google-business/location", async (req, res) => {
  const forceFresh = String(req.query.fresh || "") === "1";
  if (!forceFresh) {
    const cached = getLocationCache(req.business.id, 600);
    if (cached) return res.json({ cached: true, location: cached });
  }
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const r = await getLocationInfo(ctx.accessToken, ctx.locationId);
  if (!r.ok) return res.status(502).json({ error: r.error });
  setLocationCache(req.business.id, r.location);
  return res.json({ cached: false, location: r.location });
});

router.patch("/google-business/location", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const body = req.body || {};
  const patch = {};
  const masks = [];
  if (typeof body.websiteUri === "string") {
    patch.websiteUri = body.websiteUri;
    masks.push("websiteUri");
  }
  if (body.regularHours && typeof body.regularHours === "object") {
    patch.regularHours = body.regularHours;
    masks.push("regularHours");
  }
  if (Array.isArray(body.specialHours?.specialHourPeriods)) {
    patch.specialHours = body.specialHours;
    masks.push("specialHours");
  }
  if (typeof body.profile?.description === "string") {
    patch.profile = { description: body.profile.description };
    masks.push("profile.description");
  }
  if (masks.length === 0) return res.status(400).json({ error: "no_fields_to_update" });
  const r = await patchLocationInfo(ctx.accessToken, ctx.locationId, patch, masks.join(","));
  if (!r.ok) return res.status(502).json({ error: r.error });
  setLocationCache(req.business.id, r.location);
  return res.json({ ok: true, location: r.location });
});

// ─────────────────────────── MEDIA (photos) ───────────────────────────

function mapMediaFromApi(m) {
  const name = String(m.name || "");
  const mediaId = name.split("/").pop();
  return {
    mediaId,
    name,
    mediaFormat: String(m.mediaFormat || ""),
    category: String(m?.locationAssociation?.category || ""),
    googleUrl: String(m.googleUrl || ""),
    thumbnailUrl: String(m.thumbnailUrl || ""),
    createTime: String(m.createTime || ""),
    raw: m,
  };
}

router.get("/google-business/media", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const r = await listMedia(ctx.accessToken, ctx.accountId, ctx.locationId);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const mapped = r.media.map(mapMediaFromApi);
  replaceGoogleBusinessMedia(req.business.id, mapped);
  return res.json({ media: listGoogleBusinessMedia(req.business.id).map(serializeMedia) });
});

router.post("/google-business/media", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const sourceUrl = String(req.body?.source_url || "").trim();
  if (!/^https:\/\//i.test(sourceUrl)) return res.status(400).json({ error: "invalid_source_url" });
  const category = String(req.body?.category || "ADDITIONAL").toUpperCase();
  const r = await createMediaFromSourceUrl(ctx.accessToken, ctx.accountId, ctx.locationId, sourceUrl, category);
  if (!r.ok) return res.status(502).json({ error: r.error });
  // Refetch
  const listR = await listMedia(ctx.accessToken, ctx.accountId, ctx.locationId);
  if (listR.ok) replaceGoogleBusinessMedia(req.business.id, listR.media.map(mapMediaFromApi));
  return res.json({ ok: true, media: listGoogleBusinessMedia(req.business.id).map(serializeMedia) });
});

router.delete("/google-business/media/:mediaId", async (req, res) => {
  const ctx = await requireGoogleBusinessContext(req, res);
  if (!ctx) return;
  const mediaId = String(req.params.mediaId);
  const resource = `accounts/${ctx.accountId}/locations/${ctx.locationId}/media/${mediaId}`;
  const r = await deleteMedia(ctx.accessToken, resource);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const listR = await listMedia(ctx.accessToken, ctx.accountId, ctx.locationId);
  if (listR.ok) replaceGoogleBusinessMedia(req.business.id, listR.media.map(mapMediaFromApi));
  return res.json({ ok: true });
});

// ─────────────────────────── MULTI-ÉTABLISSEMENTS ───────────────────────────

/**
 * Liste toutes les fiches Google Business disponibles pour le compte OAuth connecté.
 * Utilisé après un OAuth réussi pour laisser le marchand choisir la bonne fiche.
 */
router.get("/google-business/locations", async (req, res) => {
  const businessId = req.business.id;
  const conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (!conn) return res.status(409).json({ error: "google_business_not_connected" });

  let accessToken = conn.access_token || "";
  const expAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : NaN;
  const needsRefresh = !accessToken || (Number.isFinite(expAt) && expAt - Date.now() < 120_000);
  if (needsRefresh && conn.refresh_token) {
    const r = await refreshGoogleBusinessAccessToken(conn.refresh_token);
    if (r.ok) {
      accessToken = r.accessToken;
      const meta = parseSocialOAuthMetadata(conn);
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
  if (!accessToken) return res.status(401).json({ error: "token_refresh_failed" });

  // Use wildcard accounts/- to list all locations — no call to mybusinessaccountmanagement
  const flat = await listAllGoogleBusinessLocationsFlat(accessToken);
  if (!flat.ok) return res.status(502).json({ error: flat.error || "locations_failed" });

  const allLocations = flat.locations.map((loc) => {
    const name = String(loc.name || "");
    const parsed = name.match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
    return parsed
      ? {
          location_id: parsed[2],
          account_id: parsed[1],
          location_name: String(loc.title || "").trim(),
          place_id: String(loc.metadata?.placeId || "").trim() || null,
          address: String(loc.metadata?.mapsUri || "").trim() || null,
        }
      : null;
  }).filter(Boolean);

  // Persist account_id from first result if not yet stored
  const meta = parseSocialOAuthMetadata(conn);
  if (!meta.account_id && allLocations.length > 0) {
    patchSocialOAuthConnectionMetadata(businessId, PROVIDER_GOOGLE_BUSINESS, { account_id: allLocations[0].account_id });
  }

  return res.json({ locations: allLocations });
});

/**
 * Sélectionne manuellement une fiche parmi celles du compte OAuth.
 * Met à jour account_id, location_id, location_title et matched_place_id dans les métadonnées.
 */
router.post("/google-business/location/select", async (req, res) => {
  const businessId = req.business.id;
  const conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (!conn) return res.status(409).json({ error: "google_business_not_connected" });

  const locationId = String(req.body?.location_id || "").trim();
  // account_id may be provided by the client (from the /locations response) to support multi-account
  const requestedAccountId = String(req.body?.account_id || "").trim();
  if (!locationId) return res.status(400).json({ error: "location_id_required" });

  let accessToken = conn.access_token || "";
  const expAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : NaN;
  const needsRefresh = !accessToken || (Number.isFinite(expAt) && expAt - Date.now() < 120_000);
  if (needsRefresh && conn.refresh_token) {
    const r = await refreshGoogleBusinessAccessToken(conn.refresh_token);
    if (r.ok) {
      accessToken = r.accessToken;
      const meta = parseSocialOAuthMetadata(conn);
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
  if (!accessToken) return res.status(401).json({ error: "token_refresh_failed" });

  // Use wildcard to find the location — avoids mybusinessaccountmanagement entirely
  const flat = await listAllGoogleBusinessLocationsFlat(accessToken);
  if (!flat.ok) return res.status(502).json({ error: flat.error || "locations_failed" });

  const match = flat.locations.find((loc) => {
    const name = String(loc.name || "");
    const parsed = name.match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
    return parsed ? parsed[2] === locationId : name.split("/").pop() === locationId;
  });
  if (!match) return res.status(404).json({ error: "location_not_found" });

  const locName = String(match.name || "");
  const parsedName = locName.match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
  const accountId = requestedAccountId || (parsedName ? parsedName[1] : String(parseSocialOAuthMetadata(conn).account_id || "").trim());

  const locationTitle = String(match.title || "").trim();
  const matchedPlaceId = String(match.metadata?.placeId || "").trim() || null;

  patchSocialOAuthConnectionMetadata(businessId, PROVIDER_GOOGLE_BUSINESS, {
    account_id: accountId,
    location_id: locationId,
    location_title: locationTitle,
    matched_place_id: matchedPlaceId,
    location_pending: false,
  });

  logger.info({ businessId, accountId, locationId, locationTitle, matchedPlaceId }, "[gbp-routes] location selected");

  setImmediate(() => {
    syncReviewsForBusiness(businessId, { notifyNew: false, isFirstSync: true })
      .catch((err) => logger.warn({ err, businessId }, "[gbp-routes] location select sync"));
    registerGbpPubSubIfConfigured(businessId, accessToken, accountId).catch((err) =>
      logger.warn({ err, businessId }, "[gbp-routes] location select pubsub"),
    );
  });

  return res.json({
    ok: true,
    matched_place_id: matchedPlaceId,
    location_title: locationTitle,
    location_id: locationId,
  });
});

export default router;
