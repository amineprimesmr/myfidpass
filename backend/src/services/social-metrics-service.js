/**
 * Agrégation métriques sociales + Google Places + OAuth (Meta/IG+FB, YouTube, TikTok).
 */
import {
  insertSocialMetricSnapshot,
  listSnapshotsForChannel,
  getLatestSnapshot,
  getBaselineSnapshot,
  getPreviousSnapshot,
} from "../db/social-metrics.js";
import {
  getSocialOAuthConnection,
  upsertSocialOAuthConnection,
  PROVIDER_META_INSTAGRAM,
  PROVIDER_GOOGLE_YOUTUBE,
  PROVIDER_GOOGLE_BUSINESS,
  PROVIDER_TIKTOK,
} from "../db/social-oauth.js";
import {
  listGoogleBusinessReviews,
  refreshGoogleBusinessAccessToken,
  isGoogleBusinessOAuthConfigured,
} from "./google-business-oauth.js";
import {
  refreshFollowersFromStoredUserToken,
  refreshFacebookFanFromMetaUserToken,
  isMetaOAuthConfigured,
} from "./meta-instagram-oauth.js";
import {
  fetchYouTubeChannelStats,
  refreshYouTubeAccessToken,
  isYouTubeOAuthConfigured,
} from "./google-youtube-oauth.js";
import {
  fetchTikTokUserStats,
  refreshTikTokAccessToken,
  isTikTokOAuthConfigured,
} from "./tiktok-oauth.js";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const REQUEST_TIMEOUT_MS = 12000;

const CHANNEL_META = {
  google_review: { label: "Google", primaryMetric: "reviews_count", secondaryMetric: "rating" },
  instagram_follow: { label: "Instagram", primaryMetric: "followers" },
  tiktok_follow: { label: "TikTok", primaryMetric: "followers" },
  facebook_follow: { label: "Facebook", primaryMetric: "followers" },
  twitter_follow: { label: "X", primaryMetric: "followers" },
  snapchat_follow: { label: "Snapchat", primaryMetric: "followers" },
  linkedin_follow: { label: "LinkedIn", primaryMetric: "followers" },
  youtube_follow: { label: "YouTube", primaryMetric: "followers" },
  trustpilot_review: { label: "Trustpilot", primaryMetric: "reviews_count" },
  tripadvisor_review: { label: "Tripadvisor", primaryMetric: "reviews_count" },
};

function parseConnMetadata(conn) {
  if (!conn?.metadata_json) return {};
  try {
    return JSON.parse(conn.metadata_json);
  } catch {
    return {};
  }
}

export function listEngagementChannelKeys() {
  return Object.keys(CHANNEL_META);
}

export function channelLabel(key) {
  return CHANNEL_META[key]?.label ?? key;
}

function parseMetricsRow(row) {
  if (!row) return null;
  let m = {};
  try {
    m = JSON.parse(row.metrics_json || "{}");
  } catch (_) {
    m = {};
  }
  return {
    captured_at: row.captured_at,
    source: row.source,
    metrics: m,
  };
}

function deltaNum(current, previous, key) {
  const a = Number(current?.[key]);
  const b = Number(previous?.[key]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) * 1000) / 1000;
}

/**
 * @param {string} placeId
 * @returns {Promise<{ ok: boolean, error?: string, metrics?: object }>}
 */
export async function fetchGooglePlaceMetrics(placeId) {
  const pid = String(placeId || "").trim();
  if (!pid) return { ok: false, error: "place_id_manquant" };
  if (!GOOGLE_PLACES_API_KEY) return { ok: false, error: "google_places_non_configure" };
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(pid)}&fields=rating,user_ratings_total&language=fr&key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== "OK" || !data.result) {
      const msg = data.error_message || data.status || "places_error";
      return { ok: false, error: String(msg) };
    }
    const r = data.result;
    const reviewsCount = Number(r.user_ratings_total);
    const rating = r.rating != null ? Number(r.rating) : null;
    const metrics = {};
    if (Number.isFinite(reviewsCount)) metrics.reviews_count = reviewsCount;
    if (Number.isFinite(rating)) metrics.rating = Math.round(rating * 100) / 100;
    return { ok: true, metrics };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "fetch_error" };
  } finally {
    clearTimeout(timer);
  }
}

function metricsEqual(a, b) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (Number(a[k]) !== Number(b[k])) return false;
  }
  return true;
}

/**
 * Snapshot Google Places (note + nombre d’avis publics) — sans OAuth Business Profile.
 */
export async function refreshGooglePlacesSnapshotFromPlaceId(businessId, placeId) {
  const fetched = await fetchGooglePlaceMetrics(placeId);
  if (!fetched.ok || !fetched.metrics) {
    return { ok: false, error: fetched.error || "fetch_failed" };
  }
  const latest = getLatestSnapshot(businessId, "google_review");
  const prevParsed = latest ? parseMetricsRow(latest) : null;
  if (prevParsed && metricsEqual(prevParsed.metrics, fetched.metrics)) {
    return { ok: true, skipped: true, metrics: fetched.metrics };
  }
  insertSocialMetricSnapshot(businessId, "google_review", "google_places", fetched.metrics);
  return { ok: true, skipped: false, metrics: fetched.metrics };
}

/**
 * Avis Google via OAuth Business Profile (données propriétaire).
 */
export async function refreshGoogleBusinessSnapshotForBusiness(businessId) {
  let conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (!conn?.access_token && !conn?.refresh_token) return { ok: false, error: "no_oauth" };
  let accessToken = conn.access_token;
  if (!accessToken && conn.refresh_token) {
    const ref = await refreshGoogleBusinessAccessToken(conn.refresh_token);
    if (!ref.ok) return { ok: false, error: ref.error || "refresh_failed" };
    accessToken = ref.accessToken;
    upsertSocialOAuthConnection({
      businessId,
      provider: PROVIDER_GOOGLE_BUSINESS,
      accessToken: ref.accessToken,
      refreshToken: conn.refresh_token,
      tokenExpiresAt: ref.expiresAt,
      externalUserId: conn.external_user_id,
      metadata: parseConnMetadata(conn),
    });
    conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  }
  const meta = parseConnMetadata(conn);
  const accountId = meta.account_id;
  const locationId = meta.location_id;
  if (!accountId || !locationId) return { ok: false, error: "no_location_meta" };

  let rev = await listGoogleBusinessReviews(accessToken, accountId, locationId);
  if (!rev.ok && conn.refresh_token) {
    const ref = await refreshGoogleBusinessAccessToken(conn.refresh_token);
    if (ref.ok) {
      accessToken = ref.accessToken;
      upsertSocialOAuthConnection({
        businessId,
        provider: PROVIDER_GOOGLE_BUSINESS,
        accessToken: ref.accessToken,
        refreshToken: conn.refresh_token,
        tokenExpiresAt: ref.expiresAt,
        externalUserId: conn.external_user_id,
        metadata: parseConnMetadata(conn),
      });
      rev = await listGoogleBusinessReviews(accessToken, accountId, locationId);
    }
  }
  if (!rev.ok) return rev;

  const metrics = {
    reviews_count: rev.reviewsCount,
    rating: rev.rating,
    reviews_sample: JSON.stringify(rev.samples),
  };
  const latest = getLatestSnapshot(businessId, "google_review");
  const prevParsed = latest ? parseMetricsRow(latest) : null;
  if (prevParsed && metricsEqual(prevParsed.metrics, metrics)) {
    return { ok: true, skipped: true, metrics };
  }
  insertSocialMetricSnapshot(businessId, "google_review", "oauth_google_business", metrics);
  return { ok: true, skipped: false, metrics };
}

/**
 * Priorité : OAuth Google Business Profile si connecté, sinon Places (Place ID public).
 */
export async function refreshGoogleSnapshotForBusiness(businessId, placeId) {
  const gbpConn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  if (gbpConn?.access_token || gbpConn?.refresh_token) {
    const gbp = await refreshGoogleBusinessSnapshotForBusiness(businessId);
    if (gbp.ok) return gbp;
  }
  return refreshGooglePlacesSnapshotFromPlaceId(businessId, placeId);
}

/**
 * @param {string} businessId
 * @param {object} engagementRewards - getEngagementRewards()
 */
export function buildSocialMetricsSummary(businessId, engagementRewards) {
  const er = engagementRewards && typeof engagementRewards === "object" ? engagementRewards : {};
  const channels = [];

  const metaConn = getSocialOAuthConnection(businessId, PROVIDER_META_INSTAGRAM);
  const ytConn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_YOUTUBE);
  const ttConn = getSocialOAuthConnection(businessId, PROVIDER_TIKTOK);
  const gbpConn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_BUSINESS);
  const gbpOk = !!(gbpConn?.access_token || gbpConn?.refresh_token);
  const metaMeta = parseConnMetadata(metaConn);

  for (const channel of Object.keys(CHANNEL_META)) {
    const cfg = er[channel];
    const enabled = !!(cfg && cfg.enabled);
    const url = String(cfg?.url ?? "").trim();
    const placeId = channel === "google_review" ? String(cfg?.place_id ?? "").trim() : "";

    const latestRow = getLatestSnapshot(businessId, channel);
    const baselineRow = getBaselineSnapshot(businessId, channel);
    const latest = latestRow ? parseMetricsRow(latestRow) : null;
    const baseline = baselineRow ? parseMetricsRow(baselineRow) : null;

    let deltaSinceBaseline = null;
    let deltaSincePrevious = null;
    if (latest && baseline && latest.captured_at !== baseline.captured_at) {
      const d = {};
      for (const k of Object.keys(latest.metrics)) {
        const diff = deltaNum(latest.metrics, baseline.metrics, k);
        if (diff != null && diff !== 0) d[k] = diff;
      }
      deltaSinceBaseline = Object.keys(d).length ? d : {};
    }
    if (latest) {
      const prevRow = getPreviousSnapshot(businessId, channel, latest.captured_at);
      const prev = prevRow ? parseMetricsRow(prevRow) : null;
      if (prev) {
        const d = {};
        for (const k of Object.keys(latest.metrics)) {
          const diff = deltaNum(latest.metrics, prev.metrics, k);
          if (diff != null && diff !== 0) d[k] = diff;
        }
        deltaSincePrevious = Object.keys(d).length ? d : {};
      }
    }

    const historyRows = listSnapshotsForChannel(businessId, channel, 40);
    const history = historyRows
      .map((row) => parseMetricsRow(row))
      .filter(Boolean)
      .reverse();

    let oauthConnected = false;
    if (channel === "instagram_follow" || channel === "facebook_follow") {
      oauthConnected = !!metaConn?.access_token;
      if (channel === "facebook_follow" && !metaMeta.facebook_page_id) oauthConnected = false;
    } else if (channel === "youtube_follow") {
      oauthConnected = !!ytConn?.access_token;
    } else if (channel === "tiktok_follow") {
      oauthConnected = !!ttConn?.access_token;
    } else if (channel === "google_review") {
      oauthConnected = gbpOk;
    }

    let reviewsSample = null;
    if (channel === "google_review" && latest?.metrics) {
      const raw = latest.metrics.reviews_sample;
      if (typeof raw === "string") {
        try {
          reviewsSample = JSON.parse(raw);
        } catch (_) {
          reviewsSample = null;
        }
      } else if (Array.isArray(raw)) {
        reviewsSample = raw;
      }
    }

    const meta = CHANNEL_META[channel];
    channels.push({
      channel,
      label: meta.label,
      enabled,
      configured: channel === "google_review" ? placeId.length > 0 || gbpOk : url.length > 0,
      latest,
      baseline_captured_at: baseline?.captured_at ?? null,
      delta_since_baseline: deltaSinceBaseline,
      delta_since_previous: deltaSincePrevious,
      history,
      google_auto_available:
        channel === "google_review" && (!!GOOGLE_PLACES_API_KEY || gbpOk),
      oauth_connected: oauthConnected,
      reviews_sample: reviewsSample,
    });
  }

  return {
    channels,
    google_places_configured: !!GOOGLE_PLACES_API_KEY,
    google_business_oauth_available: isGoogleBusinessOAuthConfigured(),
    meta_oauth_available: isMetaOAuthConfigured(),
    youtube_oauth_available: isYouTubeOAuthConfigured(),
    tiktok_oauth_available: isTikTokOAuthConfigured(),
    generated_at: new Date().toISOString(),
  };
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, followersCount?: number }>}
 */
export async function refreshInstagramOAuthForBusiness(businessId) {
  const conn = getSocialOAuthConnection(businessId, PROVIDER_META_INSTAGRAM);
  if (!conn?.access_token) return { ok: false, error: "no_oauth" };
  const igUserId = conn.external_user_id;
  if (!igUserId) return { ok: false, error: "no_ig_user" };
  const r = await refreshFollowersFromStoredUserToken(conn.access_token, igUserId);
  if (!r.ok) return r;
  insertSocialMetricSnapshot(businessId, "instagram_follow", "oauth_meta", { followers: r.followersCount });
  return { ok: true, followersCount: r.followersCount };
}

/**
 * Fans Page Facebook (même OAuth Meta qu’Instagram).
 */
export async function refreshFacebookFanOAuthForBusiness(businessId) {
  const conn = getSocialOAuthConnection(businessId, PROVIDER_META_INSTAGRAM);
  if (!conn?.access_token) return { ok: false, error: "no_oauth" };
  const meta = parseConnMetadata(conn);
  const pageId = meta.facebook_page_id;
  if (!pageId) return { ok: false, error: "no_facebook_page" };
  const r = await refreshFacebookFanFromMetaUserToken(conn.access_token, pageId);
  if (!r.ok) return r;
  insertSocialMetricSnapshot(businessId, "facebook_follow", "oauth_meta", { followers: r.fanCount });
  return { ok: true, fanCount: r.fanCount };
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, subscriberCount?: number }>}
 */
export async function refreshYouTubeOAuthForBusiness(businessId) {
  let conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_YOUTUBE);
  if (!conn?.access_token && !conn?.refresh_token) return { ok: false, error: "no_oauth" };
  let accessToken = conn.access_token;
  if (!accessToken && conn.refresh_token) {
    const ref = await refreshYouTubeAccessToken(conn.refresh_token);
    if (!ref.ok) return { ok: false, error: ref.error || "refresh_failed" };
    accessToken = ref.accessToken;
    upsertSocialOAuthConnection({
      businessId,
      provider: PROVIDER_GOOGLE_YOUTUBE,
      accessToken: ref.accessToken,
      refreshToken: conn.refresh_token,
      tokenExpiresAt: ref.expiresAt,
      externalUserId: conn.external_user_id,
      metadata: parseConnMetadata(conn),
    });
    conn = getSocialOAuthConnection(businessId, PROVIDER_GOOGLE_YOUTUBE);
  }
  let stats = await fetchYouTubeChannelStats(accessToken);
  if (!stats.ok && conn.refresh_token) {
    const ref = await refreshYouTubeAccessToken(conn.refresh_token);
    if (ref.ok) {
      accessToken = ref.accessToken;
      upsertSocialOAuthConnection({
        businessId,
        provider: PROVIDER_GOOGLE_YOUTUBE,
        accessToken: ref.accessToken,
        refreshToken: conn.refresh_token,
        tokenExpiresAt: ref.expiresAt,
        externalUserId: conn.external_user_id,
        metadata: parseConnMetadata(conn),
      });
      stats = await fetchYouTubeChannelStats(accessToken);
    }
  }
  if (!stats.ok) return stats;
  insertSocialMetricSnapshot(businessId, "youtube_follow", "oauth_google_youtube", {
    followers: stats.subscriberCount,
  });
  return { ok: true, subscriberCount: stats.subscriberCount };
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, followerCount?: number }>}
 */
export async function refreshTikTokOAuthForBusiness(businessId) {
  let conn = getSocialOAuthConnection(businessId, PROVIDER_TIKTOK);
  if (!conn?.access_token && !conn?.refresh_token) return { ok: false, error: "no_oauth" };
  let accessToken = conn.access_token;
  if (!accessToken && conn.refresh_token) {
    const ref = await refreshTikTokAccessToken(conn.refresh_token);
    if (!ref.ok) return { ok: false, error: ref.error || "refresh_failed" };
    accessToken = ref.accessToken;
    upsertSocialOAuthConnection({
      businessId,
      provider: PROVIDER_TIKTOK,
      accessToken: ref.accessToken,
      refreshToken: conn.refresh_token,
      tokenExpiresAt: ref.expiresAt,
      externalUserId: conn.external_user_id,
      metadata: parseConnMetadata(conn),
    });
    conn = getSocialOAuthConnection(businessId, PROVIDER_TIKTOK);
  }
  let user = await fetchTikTokUserStats(accessToken);
  if (!user.ok && conn.refresh_token) {
    const ref = await refreshTikTokAccessToken(conn.refresh_token);
    if (ref.ok) {
      accessToken = ref.accessToken;
      upsertSocialOAuthConnection({
        businessId,
        provider: PROVIDER_TIKTOK,
        accessToken: ref.accessToken,
        refreshToken: conn.refresh_token,
        tokenExpiresAt: ref.expiresAt,
        externalUserId: conn.external_user_id,
        metadata: parseConnMetadata(conn),
      });
      user = await fetchTikTokUserStats(accessToken);
    }
  }
  if (!user.ok) return user;
  insertSocialMetricSnapshot(businessId, "tiktok_follow", "oauth_tiktok", { followers: user.followerCount });
  return { ok: true, followerCount: user.followerCount };
}
