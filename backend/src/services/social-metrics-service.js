/**
 * Agrégation métriques sociales + fetch Google Places (avis / note).
 * Les autres réseaux : snapshots manuels (commerçant saisit followers, etc.).
 */
import {
  insertSocialMetricSnapshot,
  listSnapshotsForChannel,
  getLatestSnapshot,
  getBaselineSnapshot,
  getPreviousSnapshot,
} from "../db/social-metrics.js";

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
 * Enregistre un snapshot Google si les valeurs ont changé (ou premier snapshot).
 */
export async function refreshGoogleSnapshotForBusiness(businessId, placeId) {
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
 * @param {string} businessId
 * @param {object} engagementRewards - getEngagementRewards()
 */
export function buildSocialMetricsSummary(businessId, engagementRewards) {
  const er = engagementRewards && typeof engagementRewards === "object" ? engagementRewards : {};
  const channels = [];

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

    const meta = CHANNEL_META[channel];
    channels.push({
      channel,
      label: meta.label,
      enabled,
      configured: channel === "google_review" ? placeId.length > 0 : url.length > 0,
      latest,
      baseline_captured_at: baseline?.captured_at ?? null,
      delta_since_baseline: deltaSinceBaseline,
      delta_since_previous: deltaSincePrevious,
      history,
      google_auto_available: channel === "google_review" && !!GOOGLE_PLACES_API_KEY,
    });
  }

  return {
    channels,
    google_places_configured: !!GOOGLE_PLACES_API_KEY,
    generated_at: new Date().toISOString(),
  };
}
