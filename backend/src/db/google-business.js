/**
 * Google Business Profile — stockage local (avis, posts, Q&A, cache location/insights/media).
 * Permet la détection des nouveaux avis (delta), la liste paginée côté UI sans dépendre de
 * la disponibilité de l'API Google à chaque requête, et la gestion d'état (vu, répondu, starré).
 *
 * @module db/google-business
 */
import { getDb } from "./connection.js";
import { PROVIDER_GOOGLE_BUSINESS } from "./social-oauth.js";

const db = getDb();

/**
 * Convertit une note Google (chaîne "ONE"/.../"FIVE") ou un nombre en entier 0..5.
 */
export function starRatingToNum(starRating) {
  if (typeof starRating === "number") {
    return Math.max(0, Math.min(5, Math.round(starRating)));
  }
  const m = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    STAR_RATING_UNSPECIFIED: 0,
  };
  return m[String(starRating || "").trim().toUpperCase()] ?? 0;
}

// ─────────────────────────────────────────── REVIEWS ───────────────────────────────────────────

/**
 * Upsert d'un avis Google Business Profile.
 * Retourne { isNew: boolean, changed: boolean, replyChanged: boolean } pour piloter les push / flags.
 *
 * @param {object} row
 * @param {string} row.businessId
 * @param {string} row.reviewId
 * @param {string} [row.locationName]
 * @param {number} row.rating
 * @param {string} [row.authorName]
 * @param {string} [row.authorPhotoUrl]
 * @param {string} [row.comment]
 * @param {string|null} [row.replyComment]
 * @param {string|null} [row.replyUpdateTime]
 * @param {string} [row.createTime]
 * @param {string} [row.updateTime]
 * @param {object} [row.raw]
 */
export function upsertGoogleBusinessReview(row) {
  const existing = db.prepare(
    "SELECT review_id, rating, reply_comment, update_time, archived FROM google_business_reviews WHERE business_id = ? AND review_id = ?",
  ).get(row.businessId, row.reviewId);

  const rawJson = row.raw ? JSON.stringify(row.raw) : null;
  const payload = [
    row.reviewId,
    row.businessId,
    row.locationName || null,
    Number.isFinite(row.rating) ? row.rating : 0,
    row.authorName || null,
    row.authorPhotoUrl || null,
    row.comment || null,
    row.replyComment || null,
    row.replyUpdateTime || null,
    row.createTime || null,
    row.updateTime || null,
    rawJson,
  ];

  if (!existing) {
    db.prepare(
      `INSERT INTO google_business_reviews
       (review_id, business_id, location_name, rating, author_name, author_photo_url, comment,
        reply_comment, reply_update_time, create_time, update_time, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...payload);
    return { isNew: true, changed: true, replyChanged: false };
  }

  const prevReply = String(existing.reply_comment || "").trim();
  const newReply = String(row.replyComment || "").trim();
  const replyChanged = prevReply !== newReply;
  const updateChanged = String(existing.update_time || "") !== String(row.updateTime || "");

  db.prepare(
    `UPDATE google_business_reviews
       SET location_name = ?, rating = ?, author_name = ?, author_photo_url = ?, comment = ?,
           reply_comment = ?, reply_update_time = ?, create_time = ?, update_time = ?, raw_json = ?
     WHERE business_id = ? AND review_id = ?`,
  ).run(
    row.locationName || null,
    Number.isFinite(row.rating) ? row.rating : 0,
    row.authorName || null,
    row.authorPhotoUrl || null,
    row.comment || null,
    row.replyComment || null,
    row.replyUpdateTime || null,
    row.createTime || null,
    row.updateTime || null,
    rawJson,
    row.businessId,
    row.reviewId,
  );

  return { isNew: false, changed: updateChanged || replyChanged, replyChanged };
}

export function markReviewNotified(businessId, reviewId) {
  db.prepare(
    "UPDATE google_business_reviews SET notified_at = datetime('now') WHERE business_id = ? AND review_id = ?",
  ).run(businessId, reviewId);
}

export function markReviewSeenByMerchant(businessId, reviewId) {
  db.prepare(
    "UPDATE google_business_reviews SET seen_by_merchant_at = datetime('now') WHERE business_id = ? AND review_id = ?",
  ).run(businessId, reviewId);
}

export function markAllReviewsSeenByMerchant(businessId) {
  db.prepare(
    "UPDATE google_business_reviews SET seen_by_merchant_at = datetime('now') WHERE business_id = ? AND seen_by_merchant_at IS NULL",
  ).run(businessId);
}

export function setReviewStarred(businessId, reviewId, starred) {
  db.prepare(
    "UPDATE google_business_reviews SET starred = ? WHERE business_id = ? AND review_id = ?",
  ).run(starred ? 1 : 0, businessId, reviewId);
}

export function setReviewArchived(businessId, reviewId, archived) {
  db.prepare(
    "UPDATE google_business_reviews SET archived = ? WHERE business_id = ? AND review_id = ?",
  ).run(archived ? 1 : 0, businessId, reviewId);
}

export function setReviewReply(businessId, reviewId, replyComment, replyUpdateTime) {
  db.prepare(
    `UPDATE google_business_reviews
       SET reply_comment = ?, reply_update_time = ?
     WHERE business_id = ? AND review_id = ?`,
  ).run(
    replyComment || null,
    replyUpdateTime || (replyComment ? new Date().toISOString() : null),
    businessId,
    reviewId,
  );
}

export function getGoogleBusinessReviewById(businessId, reviewId) {
  return db.prepare(
    "SELECT * FROM google_business_reviews WHERE business_id = ? AND review_id = ?",
  ).get(businessId, reviewId);
}

/**
 * Liste paginée.
 * @param {string} businessId
 * @param {object} [opts]
 * @param {"recent"|"oldest"|"rating_asc"|"rating_desc"|"unreplied"|"starred"} [opts.sort]
 * @param {number} [opts.minRating]
 * @param {number} [opts.maxRating]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export function listGoogleBusinessReviews(businessId, opts = {}) {
  const limit = Math.max(1, Math.min(200, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const minRating = Number.isFinite(opts.minRating) ? opts.minRating : null;
  const maxRating = Number.isFinite(opts.maxRating) ? opts.maxRating : null;
  const parts = ["business_id = ?"];
  const params = [businessId];
  if (minRating != null) {
    parts.push("rating >= ?");
    params.push(minRating);
  }
  if (maxRating != null) {
    parts.push("rating <= ?");
    params.push(maxRating);
  }
  if (opts.sort === "unreplied") {
    parts.push("(reply_comment IS NULL OR trim(reply_comment) = '')");
  }
  if (opts.sort === "starred") {
    parts.push("starred = 1");
  }
  if (!opts.includeArchived) {
    parts.push("archived = 0");
  }
  const order = (() => {
    switch (opts.sort) {
      case "oldest": return "ORDER BY update_time ASC";
      case "rating_asc": return "ORDER BY rating ASC, update_time DESC";
      case "rating_desc": return "ORDER BY rating DESC, update_time DESC";
      default: return "ORDER BY update_time DESC";
    }
  })();
  const sql = `SELECT * FROM google_business_reviews WHERE ${parts.join(" AND ")} ${order} LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function countGoogleBusinessReviews(businessId) {
  const row = db.prepare(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN reply_comment IS NULL OR trim(reply_comment) = '' THEN 1 ELSE 0 END) AS unreplied,
      SUM(CASE WHEN seen_by_merchant_at IS NULL THEN 1 ELSE 0 END) AS unseen,
      SUM(CASE WHEN starred = 1 THEN 1 ELSE 0 END) AS starred,
      SUM(CASE WHEN rating <= 2 AND (reply_comment IS NULL OR trim(reply_comment) = '') THEN 1 ELSE 0 END) AS negatives_unreplied,
      AVG(rating) AS avg_rating
     FROM google_business_reviews
     WHERE business_id = ? AND archived = 0`,
  ).get(businessId);
  return {
    total: Number(row?.total || 0),
    unreplied: Number(row?.unreplied || 0),
    unseen: Number(row?.unseen || 0),
    starred: Number(row?.starred || 0),
    negativesUnreplied: Number(row?.negatives_unreplied || 0),
    averageRating: row?.avg_rating != null ? Number(row.avg_rating) : null,
  };
}

// ─────────────────────────────────────────── POSTS ───────────────────────────────────────────

export function replaceGoogleBusinessPosts(businessId, posts) {
  const tx = db.transaction((list) => {
    db.prepare("DELETE FROM google_business_posts WHERE business_id = ?").run(businessId);
    const stmt = db.prepare(
      `INSERT INTO google_business_posts
       (post_id, business_id, name, topic_type, summary, language_code, media_url, cta_type, cta_url,
        event_title, event_start, event_end, offer_coupon, offer_redeem_online_url, offer_terms,
        state, create_time, update_time, search_url, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of list) {
      stmt.run(
        p.postId,
        businessId,
        p.name || null,
        p.topicType || null,
        p.summary || null,
        p.languageCode || null,
        p.mediaUrl || null,
        p.ctaType || null,
        p.ctaUrl || null,
        p.eventTitle || null,
        p.eventStart || null,
        p.eventEnd || null,
        p.offerCoupon || null,
        p.offerRedeemOnlineUrl || null,
        p.offerTerms || null,
        p.state || null,
        p.createTime || null,
        p.updateTime || null,
        p.searchUrl || null,
        p.raw ? JSON.stringify(p.raw) : null,
      );
    }
  });
  tx(posts || []);
}

export function listGoogleBusinessPosts(businessId, limit = 100) {
  return db.prepare(
    "SELECT * FROM google_business_posts WHERE business_id = ? ORDER BY update_time DESC LIMIT ?",
  ).all(businessId, Math.max(1, Math.min(200, Number(limit) || 100)));
}

export function deleteGoogleBusinessPost(businessId, postId) {
  db.prepare("DELETE FROM google_business_posts WHERE business_id = ? AND post_id = ?").run(businessId, postId);
}

// ─────────────────────────────────────────── Q & A ───────────────────────────────────────────

export function replaceGoogleBusinessQuestions(businessId, questions) {
  const tx = db.transaction((list) => {
    db.prepare("DELETE FROM google_business_questions WHERE business_id = ?").run(businessId);
    const stmt = db.prepare(
      `INSERT INTO google_business_questions
       (question_id, business_id, name, text, author_name, author_photo_url, author_is_owner,
        upvote_count, total_answer_count, top_answer_text, top_answer_author, top_answer_update_time,
        create_time, update_time, answered_by_owner, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const q of list) {
      stmt.run(
        q.questionId,
        businessId,
        q.name || null,
        q.text || null,
        q.authorName || null,
        q.authorPhotoUrl || null,
        q.authorIsOwner ? 1 : 0,
        Number(q.upvoteCount || 0),
        Number(q.totalAnswerCount || 0),
        q.topAnswerText || null,
        q.topAnswerAuthor || null,
        q.topAnswerUpdateTime || null,
        q.createTime || null,
        q.updateTime || null,
        q.answeredByOwner ? 1 : 0,
        q.raw ? JSON.stringify(q.raw) : null,
      );
    }
  });
  tx(questions || []);
}

export function listGoogleBusinessQuestions(businessId, limit = 100) {
  return db.prepare(
    "SELECT * FROM google_business_questions WHERE business_id = ? ORDER BY update_time DESC LIMIT ?",
  ).all(businessId, Math.max(1, Math.min(200, Number(limit) || 100)));
}

export function getGoogleBusinessQuestion(businessId, questionId) {
  return db.prepare(
    "SELECT * FROM google_business_questions WHERE business_id = ? AND question_id = ?",
  ).get(businessId, questionId);
}

// ────────────────────────────────────── CACHES INSIGHTS / LOCATION / MEDIA ──────────────────────────────────────

export function setInsightsCache(businessId, payload) {
  db.prepare(
    `INSERT INTO google_business_insights_cache (business_id, payload_json, cached_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(business_id) DO UPDATE SET payload_json = excluded.payload_json, cached_at = excluded.cached_at`,
  ).run(businessId, JSON.stringify(payload || {}));
}

export function getInsightsCache(businessId, ttlSeconds = 3600) {
  const row = db.prepare(
    "SELECT payload_json, cached_at FROM google_business_insights_cache WHERE business_id = ?",
  ).get(businessId);
  if (!row) return null;
  const ts = Date.parse(row.cached_at + "Z");
  if (!Number.isFinite(ts)) return null;
  const ageSec = (Date.now() - ts) / 1000;
  if (ageSec > ttlSeconds) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_) {
    return null;
  }
}

export function setLocationCache(businessId, payload) {
  db.prepare(
    `INSERT INTO google_business_location_cache (business_id, payload_json, cached_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(business_id) DO UPDATE SET payload_json = excluded.payload_json, cached_at = excluded.cached_at`,
  ).run(businessId, JSON.stringify(payload || {}));
}

export function getLocationCache(businessId, ttlSeconds = 3600) {
  const row = db.prepare(
    "SELECT payload_json, cached_at FROM google_business_location_cache WHERE business_id = ?",
  ).get(businessId);
  if (!row) return null;
  const ts = Date.parse(row.cached_at + "Z");
  if (!Number.isFinite(ts)) return null;
  const ageSec = (Date.now() - ts) / 1000;
  if (ageSec > ttlSeconds) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_) {
    return null;
  }
}

export function replaceGoogleBusinessMedia(businessId, items) {
  const tx = db.transaction((list) => {
    db.prepare("DELETE FROM google_business_media WHERE business_id = ?").run(businessId);
    const stmt = db.prepare(
      `INSERT INTO google_business_media
       (media_id, business_id, name, media_format, category, google_url, thumbnail_url, create_time, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of list) {
      stmt.run(
        m.mediaId,
        businessId,
        m.name || null,
        m.mediaFormat || null,
        m.category || null,
        m.googleUrl || null,
        m.thumbnailUrl || null,
        m.createTime || null,
        m.raw ? JSON.stringify(m.raw) : null,
      );
    }
  });
  tx(items || []);
}

export function listGoogleBusinessMedia(businessId, limit = 100) {
  return db.prepare(
    "SELECT * FROM google_business_media WHERE business_id = ? ORDER BY create_time DESC LIMIT ?",
  ).all(businessId, Math.max(1, Math.min(500, Number(limit) || 100)));
}

/**
 * Liste les commerces avec une connexion GBP active (pour le cron sync).
 */
export function listBusinessesWithGoogleBusinessOAuth() {
  return db.prepare(
    `SELECT b.id AS business_id, b.slug, b.name
     FROM businesses b
     INNER JOIN social_oauth_connections c ON c.business_id = b.id
     WHERE c.provider = 'google_business'
       AND (c.access_token IS NOT NULL OR c.refresh_token IS NOT NULL)`,
  ).all();
}

/**
 * Résout les commerces MyFidpass liés à une paire compte/lieu Google (notification Pub/Sub).
 * @param {string} accountId - identifiant nu Google (segment après accounts/)
 * @param {string} locationId - identifiant nu lieu (segment après locations/)
 * @returns {string[]}
 */
export function findBusinessIdsForGoogleLocation(accountId, locationId) {
  const aid = String(accountId || "").trim();
  const lid = String(locationId || "").trim();
  if (!aid || !lid) return [];
  const rows = db
    .prepare(
      `SELECT business_id FROM social_oauth_connections
       WHERE provider = ?
         AND trim(COALESCE(json_extract(metadata_json, '$.account_id'), '')) = ?
         AND trim(COALESCE(json_extract(metadata_json, '$.location_id'), '')) = ?`,
    )
    .all(PROVIDER_GOOGLE_BUSINESS, aid, lid);
  const ids = rows.map((r) => String(r.business_id || "").trim()).filter(Boolean);
  return [...new Set(ids)];
}
