/**
 * OAuth Google Business Profile — scope business.manage, liste des avis (API v4).
 * Réutilise GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ; redirect dédié : …/api/oauth/google-business/callback
 * (à ajouter dans la console Google Cloud avec « Google Business Profile API » / « My Business Account Management API » / « Business Information API » activées).
 */
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/config.js";
import logger from "../lib/logger.js";

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

/** Évite que le callback OAuth reste « en chargement » indéfiniment si Google ne répond pas. */
const FETCH_TIMEOUT_MS = 25_000;

const ACCOUNT_MGMT = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO = "https://mybusinessinformation.googleapis.com/v1";
const MY_BUSINESS_V4 = "https://mybusiness.googleapis.com/v4";
const Q_AND_A = "https://mybusinessqanda.googleapis.com/v1";
const PERFORMANCE = "https://businessprofileperformance.googleapis.com/v1";
const NOTIFICATIONS = "https://mybusinessnotifications.googleapis.com/v1";

export function getGoogleBusinessRedirectUri() {
  const base = (process.env.API_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/api/oauth/google-business/callback`;
}

export function isGoogleBusinessOAuthConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function signGoogleBusinessOAuthState({ businessId, slug }) {
  return jwt.sign(
    { typ: "google_business_oauth", bid: businessId, slug: String(slug || "").trim() },
    getJwtSecret(),
    { expiresIn: "15m" },
  );
}

export function verifyGoogleBusinessOAuthState(token) {
  try {
    const p = jwt.verify(String(token || ""), getJwtSecret());
    if (p.typ !== "google_business_oauth" || !p.bid || !p.slug) return null;
    return { businessId: String(p.bid), slug: String(p.slug) };
  } catch (_) {
    return null;
  }
}

export function buildGoogleBusinessAuthorizeUrl(redirectUri, state) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set(
    "scope",
    ["https://www.googleapis.com/auth/business.manage", "email", "profile"].join(" "),
  );
  u.searchParams.set("state", state);
  return u.toString();
}

async function postForm(url, params) {
  const body = new URLSearchParams(params);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      logger.warn({ url }, "[gbp-oauth] postForm timeout");
      return { ok: false, data: { error: "timeout" } };
    }
    throw e;
  }
}

export async function exchangeGoogleBusinessAuthorizationCode(code, redirectUri) {
  const r = await postForm("https://oauth2.googleapis.com/token", {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!r.ok || !r.data?.access_token) {
    logger.warn({ data: r.data }, "[gbp-oauth] token exchange");
    return { ok: false, error: r.data?.error_description || r.data?.error || "token_exchange_failed" };
  }
  const expiresAt = r.data.expires_in
    ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
    : null;
  return {
    ok: true,
    accessToken: r.data.access_token,
    refreshToken: r.data.refresh_token || null,
    expiresAt,
  };
}

export async function refreshGoogleBusinessAccessToken(refreshToken) {
  const r = await postForm("https://oauth2.googleapis.com/token", {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!r.ok || !r.data?.access_token) {
    return { ok: false, error: r.data?.error_description || "refresh_failed" };
  }
  const expiresAt = r.data.expires_in
    ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
    : null;
  return { ok: true, accessToken: r.data.access_token, expiresAt };
}

async function fetchJson(url, accessToken) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      logger.warn({ url }, "[gbp] fetch timeout");
      return { ok: false, status: 0, data: {}, error: "timeout" };
    }
    throw e;
  }
}

/**
 * Normalise 429 / RESOURCE_EXHAUSTED en code stable côté app (évite des messages aléatoires).
 * @param {{ ok: boolean, status: number, data: object }} r
 * @returns {"google_api_quota" | null}
 */
function normalizeGoogleBusinessApiError(r) {
  if (!r || r.ok) return null;
  const status = Number(r.status || 0);
  const data = r.data && typeof r.data === "object" ? r.data : {};
  const err = data.error && typeof data.error === "object" ? data.error : data;
  const gStatus = String(err.status || data.error?.status || data.status || "").trim();
  const msg = String(err.message || data.error_description || data.message || data.error || "").toLowerCase();
  if (status === 429) return "google_api_quota";
  if (gStatus === "RESOURCE_EXHAUSTED") return "google_api_quota";
  if (gStatus === "UNAVAILABLE" && (msg.includes("quota") || msg.includes("exhausted"))) return "google_api_quota";
  if (msg.includes("resource_exhausted") || (msg.includes("quota") && (msg.includes("exceed") || msg.includes("exhausted")))) {
    return "google_api_quota";
  }
  if (/rate|too many|too_many/i.test(msg) && (status === 400 || status === 403 || status === 503)) {
    return "google_api_quota";
  }
  return null;
}

/**
 * Place ID fiche (v1, v4 ou URL newReview / Maps).
 * Sans cela, le mission « avis » ne matche jamais la fiche côté engagement.
 */
function extractPlaceIdFromBusinessLocation(L) {
  if (!L || typeof L !== "object") return "";
  const m = L.metadata && typeof L.metadata === "object" ? L.metadata : {};
  const v4 = m.placeInfo && typeof m.placeInfo === "object" ? m.placeInfo.placeId : null;
  if (v4) return String(v4).trim();
  for (const k of ["placeId", "place_id"]) {
    const v = m[k] ?? L[k];
    if (v && !String(v).toLowerCase().includes("http")) {
      const t = String(v).trim();
      if (t) return t;
    }
  }
  for (const u of [m.newReviewUri, m.newReviewUrl, m.mapsUri, m.mapsUrl, m.googleMapsUri]) {
    const s = String(u || "");
    const mm = s.match(/[?&](placeid|place_id)=([^&]+)/i);
    if (mm) {
      try {
        return decodeURIComponent(mm[2]);
      } catch {
        return mm[2];
      }
    }
  }
  return "";
}

/** Unifie v1 + v4 pour `resolve` / routes dashboard. */
function normalizeLocationForResolver(L) {
  const name = String(L.name || "");
  const title = String(L.title || L.locationName || "").trim();
  const m = L.metadata && typeof L.metadata === "object" ? L.metadata : {};
  const placeId = extractPlaceIdFromBusinessLocation(L) || String(m.placeId || "").trim();
  return {
    name,
    title,
    metadata: {
      ...m,
      ...(placeId ? { placeId } : {}),
    },
  };
}

async function jsonRequest(url, accessToken, method, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      logger.warn({ url, method }, "[gbp] jsonRequest timeout");
      return { ok: false, status: 0, data: {}, error: "timeout" };
    }
    throw e;
  }
}

/** Extrait l’identifiant numérique depuis `accounts/123…`. */
export function accountResourceIdFromName(accountName) {
  const s = String(accountName || "");
  const prefix = "accounts/";
  if (!s.startsWith(prefix)) return s;
  return s.slice(prefix.length);
}

export async function listGoogleBusinessAccounts(accessToken) {
  const r = await fetchJson(`${ACCOUNT_MGMT}/accounts`, accessToken);
  if (!r.ok) {
    logger.warn({ status: r.status, data: r.data, fetchErr: r.error }, "[gbp] accounts.list");
    const quota = normalizeGoogleBusinessApiError(r);
    return {
      ok: false,
      error: quota || r.data?.error?.message || r.data?.error?.status || "accounts_failed",
    };
  }
  const accounts = r.data.accounts || [];
  const accountNames = accounts.map((a) => a.name).filter(Boolean);
  return { ok: true, accountNames };
}

/**
 * Liste toutes les fiches accessibles via le wildcard accounts/-.
 * N'appelle PAS mybusinessaccountmanagement (quota quasi-nul) — utilise
 * mybusinessinformation directement avec le token OAuth.
 */
/**
 * Stratégie multi-API pour lister toutes les fiches d'un compte OAuth,
 * sans jamais dépendre de mybusinessaccountmanagement (quota=0).
 *
 * Ordre de tentative :
 *   1. mybusinessinformation v1  accounts/-/locations  (wildcard, quota élevé)
 *   2. mybusiness v4             accounts/-/locations  (deprecated mais quota prouvé)
 */
export async function listAllGoogleBusinessLocationsFlat(accessToken) {
  // Tentative 1 : mybusinessinformation v1 wildcard
  const r1 = await fetchJson(`${BUSINESS_INFO}/accounts/-/locations?readMask=name,title,metadata&pageSize=100`, accessToken);
  if (r1.ok) {
    const raw = r1.data.locations || [];
    if (raw.length > 0) {
      return { ok: true, locations: raw.map(normalizeLocationForResolver) };
    }
    // Bug fréquent : v1 renvoie 200 + liste vide alors que v4 a les fiches — il fallait tenter v4
    // sinon on retombait sur mybusinessaccountmanagement (quota ≈ 0) en boucle.
    logger.info("[gbp] v1 accounts/-/locations empty, trying v4");
  } else {
    logger.warn({ status: r1.status, err: r1.data?.error?.status }, "[gbp] locations.flat v1 failed, trying v4");
  }

  // Tentative 2 : mybusiness v4 wildcard (même quota que reviews — prouvé fonctionnel)
  const r2 = await fetchJson(`${MY_BUSINESS_V4}/accounts/-/locations?pageSize=100`, accessToken);
  if (r2.ok) {
    // v4 format : { locations: [{ name, locationName, metadata: { placeInfo: { placeId } } }] }
    const rawLocs = r2.data.locations || [];
    const locations = rawLocs.map((l) => ({
      name: String(l.name || ""),
      title: String(l.locationName || l.name?.split("/").pop() || ""),
      metadata: { placeId: l.metadata?.placeInfo?.placeId || l.metadata?.mapsUrl?.match(/place_id=([^&]+)/)?.[1] || "" },
    }));
    return { ok: true, locations: locations.map(normalizeLocationForResolver) };
  }
  logger.warn({ status: r2.status, err: r2.data?.error?.status }, "[gbp] locations.flat v4 failed");

  const quota = normalizeGoogleBusinessApiError(r1) || normalizeGoogleBusinessApiError(r2);
  if (quota) {
    return { ok: false, error: quota };
  }

  return {
    ok: false,
    error: r1.data?.error?.message || r2.data?.error?.message || r1.error || r2.error || "locations_failed",
  };
}

/**
 * @param {string} accountName - ex. accounts/108296424811540960824
 */
export async function listGoogleBusinessLocations(accessToken, accountName) {
  const id = accountResourceIdFromName(accountName);
  const url = `${BUSINESS_INFO}/accounts/${encodeURIComponent(id)}/locations?readMask=name,title,metadata`;
  const r = await fetchJson(url, accessToken);
  if (!r.ok) {
    logger.warn({ id, status: r.status, data: r.data, fetchErr: r.error }, "[gbp] locations.list");
    const quota = normalizeGoogleBusinessApiError(r);
    return {
      ok: false,
      error: quota || r.error || r.data?.error?.message || r.data?.error?.status || "locations_failed",
    };
  }
  const locations = r.data.locations || [];
  return { ok: true, locations };
}

function starRatingToNum(starRating) {
  const m = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    STAR_RATING_UNSPECIFIED: 0,
  };
  return m[String(starRating)] ?? 0;
}

/**
 * @param {string} accountId
 * @param {string} locationId
 */
export async function listGoogleBusinessReviews(accessToken, accountId, locationId, pageSize = 50) {
  const u = new URL(
    `${MY_BUSINESS_V4}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews`,
  );
  u.searchParams.set("pageSize", String(pageSize));
  u.searchParams.set("orderBy", "updateTime desc");
  const r = await fetchJson(u.toString(), accessToken);
  if (!r.ok) {
    logger.warn({ status: r.status, data: r.data, fetchErr: r.error }, "[gbp] reviews.list");
    return {
      ok: false,
      error: r.error || r.data?.error?.message || r.data?.error?.status || "reviews_failed",
    };
  }
  const reviews = r.data.reviews || [];
  let totalCount = Number(r.data.totalReviewCount);
  let avg = r.data.averageRating != null ? Number(r.data.averageRating) : null;

  const samples = reviews.slice(0, 15).map((rev) => {
    const reviewer = rev.reviewer || {};
    const name = String(reviewer.displayName || "").trim();
    const comment = String(rev.comment || "").trim();
    const rating = starRatingToNum(rev.starRating);
    const updateTime = String(rev.updateTime || rev.createTime || "");
    return { author: name, text: comment, rating, update_time: updateTime };
  });

  if (!Number.isFinite(totalCount)) totalCount = reviews.length;
  if (!Number.isFinite(avg) && samples.length > 0) {
    const nums = samples.map((s) => s.rating).filter((n) => n > 0);
    if (nums.length) {
      avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    }
  }
  if (!Number.isFinite(avg)) avg = null;

  return {
    ok: true,
    reviewsCount: totalCount,
    rating: avg,
    samples,
  };
}

/**
 * Associe un lieu Business Profile au Place ID déjà enregistré (mission) si possible.
 *
 * Stratégie (par ordre de priorité, du moins quota-consommateur au plus) :
 *  1. Wildcard accounts/-/locations (mybusinessinformation — quota élevé, 0 appel à accountmanagement)
 *  2. Fallback sur knownAccountId (si fourni et si le wildcard échoue)
 *  3. Dernier recours : listGoogleBusinessAccounts (mybusinessaccountmanagement — quota limité)
 *
 * @param {string} preferredPlaceId - place_id Maps côté engagement
 * @param {object} [opts]
 * @param {string} [opts.knownAccountId] - account_id déjà connu, pour le fallback rapide
 */
export async function resolveGoogleBusinessLocation(accessToken, preferredPlaceId, { knownAccountId } = {}) {
  const want = String(preferredPlaceId || "").trim();

  // ─── Étape 1 : wildcard (pas d'appel à mybusinessaccountmanagement) ───
  const flat = await listAllGoogleBusinessLocationsFlat(accessToken);
  if (flat.ok && flat.locations.length > 0) {
    const allLocs = flat.locations.map((L) => {
      const name = String(L.name || "");
      const parsed = name.match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
      return parsed ? { accountId: parsed[1], locationId: parsed[2], location: L } : null;
    }).filter(Boolean);

    let pick = null;
    if (want) {
      pick =
        allLocs.find((x) => String(x.location.metadata?.placeId || "").trim() === want) ||
        allLocs.find((x) => String(x.location.name || "").includes(want)) ||
        null;
    }
    if (!pick) pick = allLocs[0];

    return {
      ok: true,
      accountId: pick.accountId,
      locationId: pick.locationId,
      locationName: String(pick.location.name || ""),
      title: String(pick.location.title || "").trim(),
      matchedPlaceId: String(pick.location.metadata?.placeId || "").trim() || null,
    };
  }

  // ─── Étape 2 : fallback knownAccountId ───
  const accountNames = [];
  if (knownAccountId) accountNames.push(`accounts/${knownAccountId}`);

  // ─── Étape 3 : dernier recours via mybusinessaccountmanagement (quota limité) ───
  if (!accountNames.length) {
    const acc = await listGoogleBusinessAccounts(accessToken);
    if (!acc.ok) return acc;
    accountNames.push(...acc.accountNames);
  }

  const allLocs = [];
  for (const accountName of accountNames) {
    const loc = await listGoogleBusinessLocations(accessToken, accountName);
    if (!loc.ok) continue;
    for (const L of loc.locations) allLocs.push({ accountName, location: L });
  }

  const firstAccountId = accountNames.length > 0 ? accountResourceIdFromName(accountNames[0]) : null;
  if (allLocs.length === 0) {
    return { ok: false, error: "no_locations", accountId: firstAccountId };
  }

  let pick = null;
  if (want) {
    pick =
      allLocs.find((x) => String(x.location.metadata?.placeId || "").trim() === want) ||
      allLocs.find((x) => String(x.location.name || "").includes(want)) ||
      null;
  }
  if (!pick && allLocs.length === 1) pick = allLocs[0];
  if (!pick) pick = allLocs[0];

  const locName = pick.location.name || "";
  const parsed = locName.match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
  if (!parsed) {
    return { ok: false, error: "location_name_invalid" };
  }
  return {
    ok: true,
    accountId: parsed[1],
    locationId: parsed[2],
    locationName: locName,
    title: String(pick.location.title || "").trim(),
    matchedPlaceId: String(pick.location.metadata?.placeId || "").trim() || null,
  };
}

// ─────────────────────────────── REVIEWS — détail + réponse ───────────────────────────────

/**
 * Liste paginée complète (avec pageToken). Retourne les reviews Google bruts + totaux.
 */
export async function listAllGoogleBusinessReviews(accessToken, accountId, locationId, maxPages = 6) {
  let pageToken = "";
  const reviews = [];
  let total = null;
  let avg = null;
  for (let i = 0; i < maxPages; i += 1) {
    const u = new URL(
      `${MY_BUSINESS_V4}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews`,
    );
    u.searchParams.set("pageSize", "50");
    u.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await fetchJson(u.toString(), accessToken);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error || r.data?.error?.message || r.data?.error?.status || "reviews_failed",
        reviews,
      };
    }
    if (r.data.totalReviewCount != null) total = Number(r.data.totalReviewCount);
    if (r.data.averageRating != null) avg = Number(r.data.averageRating);
    for (const rev of r.data.reviews || []) reviews.push(rev);
    pageToken = String(r.data.nextPageToken || "").trim();
    if (!pageToken) break;
  }
  return { ok: true, reviews, totalCount: total, averageRating: avg };
}

/**
 * Répondre / mettre à jour la réponse à un avis.
 * @param {string} reviewResourceName - ex. "accounts/.../locations/.../reviews/ABC123"
 */
export async function updateReviewReply(accessToken, reviewResourceName, comment) {
  const url = `${MY_BUSINESS_V4}/${reviewResourceName}/reply`;
  const r = await jsonRequest(url, accessToken, "PUT", { comment: String(comment || "") });
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "reply_failed",
    };
  }
  return {
    ok: true,
    replyComment: String(r.data?.comment || comment || ""),
    replyUpdateTime: String(r.data?.updateTime || new Date().toISOString()),
  };
}

export async function deleteReviewReply(accessToken, reviewResourceName) {
  const url = `${MY_BUSINESS_V4}/${reviewResourceName}/reply`;
  const r = await jsonRequest(url, accessToken, "DELETE");
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "delete_reply_failed",
    };
  }
  return { ok: true };
}

// ─────────────────────────────── LOCAL POSTS ───────────────────────────────

/**
 * Liste les posts Google (What's New, Event, Offer).
 */
export async function listLocalPosts(accessToken, accountId, locationId, pageSize = 100) {
  const url = `${MY_BUSINESS_V4}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts?pageSize=${pageSize}`;
  const r = await fetchJson(url, accessToken);
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "posts_failed",
    };
  }
  return { ok: true, posts: r.data.localPosts || [] };
}

/**
 * Création d'un post local.
 * @param {object} body - ex. { languageCode: "fr", summary: "...", topicType: "STANDARD" }
 */
export async function createLocalPost(accessToken, accountId, locationId, body) {
  const url = `${MY_BUSINESS_V4}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`;
  const r = await jsonRequest(url, accessToken, "POST", body);
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "create_post_failed",
    };
  }
  return { ok: true, post: r.data };
}

export async function deleteLocalPost(accessToken, postResourceName) {
  const url = `${MY_BUSINESS_V4}/${postResourceName}`;
  const r = await jsonRequest(url, accessToken, "DELETE");
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "delete_post_failed",
    };
  }
  return { ok: true };
}

// ─────────────────────────────── Q & A ───────────────────────────────

/**
 * @param {string} locationResourceName - ex. "locations/12345" (sans le préfixe accounts/)
 * Le endpoint Q&A utilise uniquement "locations/{locationId}" pas "accounts/.../locations/..."
 */
export async function listQuestions(accessToken, locationId, pageSize = 50) {
  const url = `${Q_AND_A}/locations/${encodeURIComponent(locationId)}/questions?pageSize=${pageSize}&answersPerQuestion=1`;
  const r = await fetchJson(url, accessToken);
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "questions_failed",
    };
  }
  return { ok: true, questions: r.data.questions || [] };
}

/**
 * Répond à une question en tant que propriétaire.
 * @param {string} questionResourceName - ex. "locations/12345/questions/ABC"
 */
export async function upsertOwnerAnswer(accessToken, questionResourceName, text) {
  const url = `${Q_AND_A}/${questionResourceName}/answers:upsert`;
  const r = await jsonRequest(url, accessToken, "POST", { answer: { text: String(text || "") } });
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "answer_failed",
    };
  }
  return { ok: true, answer: r.data };
}

export async function deleteOwnerAnswer(accessToken, questionResourceName) {
  const url = `${Q_AND_A}/${questionResourceName}/answers:delete`;
  const r = await jsonRequest(url, accessToken, "DELETE");
  return r.ok ? { ok: true } : { ok: false, error: r.data?.error?.message || r.error || "delete_answer_failed" };
}

// ─────────────────────────────── INSIGHTS / PERFORMANCE ───────────────────────────────

/**
 * Performance API — multi-métriques en un appel.
 * @param {string} locationId - juste l'ID (ex. "12345")
 * @param {string[]} metrics - ex. ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS","CALL_CLICKS",...]
 * @param {{ year: number, month: number, day: number }} startDate
 * @param {{ year: number, month: number, day: number }} endDate
 */
export async function fetchDailyMetricsTimeSeries(accessToken, locationId, metrics, startDate, endDate) {
  const u = new URL(`${PERFORMANCE}/locations/${encodeURIComponent(locationId)}:fetchMultiDailyMetricsTimeSeries`);
  for (const m of metrics) u.searchParams.append("dailyMetrics", m);
  u.searchParams.set("dailyRange.startDate.year", String(startDate.year));
  u.searchParams.set("dailyRange.startDate.month", String(startDate.month));
  u.searchParams.set("dailyRange.startDate.day", String(startDate.day));
  u.searchParams.set("dailyRange.endDate.year", String(endDate.year));
  u.searchParams.set("dailyRange.endDate.month", String(endDate.month));
  u.searchParams.set("dailyRange.endDate.day", String(endDate.day));
  const r = await fetchJson(u.toString(), accessToken);
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "insights_failed",
    };
  }
  return { ok: true, series: r.data.multiDailyMetricTimeSeries || [] };
}

// ─────────────────────────────── LOCATION INFO ───────────────────────────────

const LOCATION_READ_MASK = [
  "name",
  "title",
  "storefrontAddress",
  "phoneNumbers",
  "websiteUri",
  "regularHours",
  "specialHours",
  "categories",
  "serviceArea",
  "labels",
  "profile",
  "metadata",
  "openInfo",
  "latlng",
].join(",");

export async function getLocationInfo(accessToken, locationId) {
  const url = `${BUSINESS_INFO}/locations/${encodeURIComponent(locationId)}?readMask=${encodeURIComponent(LOCATION_READ_MASK)}`;
  const r = await fetchJson(url, accessToken);
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "location_info_failed",
    };
  }
  return { ok: true, location: r.data };
}

/**
 * PATCH location. Le `updateMask` liste les champs modifiés (CSV).
 */
export async function patchLocationInfo(accessToken, locationId, patch, updateMask) {
  const url = `${BUSINESS_INFO}/locations/${encodeURIComponent(locationId)}?updateMask=${encodeURIComponent(updateMask)}`;
  const r = await jsonRequest(url, accessToken, "PATCH", patch);
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "location_patch_failed",
    };
  }
  return { ok: true, location: r.data };
}

// ─────────────────────────────── MEDIA (photos) ───────────────────────────────

export async function listMedia(accessToken, accountId, locationId, pageSize = 100) {
  const url = `${MY_BUSINESS_V4}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/media?pageSize=${pageSize}`;
  const r = await fetchJson(url, accessToken);
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "media_failed",
    };
  }
  return { ok: true, media: r.data.mediaItems || [] };
}

/**
 * Crée un media depuis un sourceUrl public (Google télécharge l'image).
 * @param {string} category - ex. "PROFILE","COVER","INTERIOR","EXTERIOR","LOGO","ADDITIONAL"
 */
export async function createMediaFromSourceUrl(accessToken, accountId, locationId, sourceUrl, category = "ADDITIONAL") {
  const url = `${MY_BUSINESS_V4}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/media`;
  const body = {
    mediaFormat: "PHOTO",
    locationAssociation: { category },
    sourceUrl,
  };
  const r = await jsonRequest(url, accessToken, "POST", body);
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "create_media_failed",
    };
  }
  return { ok: true, media: r.data };
}

export async function deleteMedia(accessToken, mediaResourceName) {
  const url = `${MY_BUSINESS_V4}/${mediaResourceName}`;
  const r = await jsonRequest(url, accessToken, "DELETE");
  return r.ok ? { ok: true } : { ok: false, error: r.data?.error?.message || r.error || "delete_media_failed" };
}

// ─────────────────────────────── NOTIFICATIONS PUB/SUB (temps réel) ───────────────────────────────

/**
 * Topic GCP complet : `projects/PROJECT_ID/topics/TOPIC_ID`.
 * À créer dans le même (ou un dédié) projet Cloud que l’API Business Profile, avec publish pour
 * `mybusiness-api-pubsub@system.gserviceaccount.com`.
 */
export function getConfiguredGbpPubSubTopic() {
  const t = (process.env.GOOGLE_BUSINESS_PUBSUB_TOPIC || process.env.GBP_PUBSUB_TOPIC || "").trim();
  return t || null;
}

/**
 * Enregistre un topic Pub/Sub pour les événements compte (nouveaux / avis modifiés).
 * @param {string} accountId - identifiant nu (ex. chiffres), pas le préfixe `accounts/`.
 * @param {string} pubsubTopic - ex. `projects/my-gcp/topics/myfidpass-gbp`
 */
export async function enableNotifications(accessToken, accountId, pubsubTopic) {
  const id = String(accountId || "").trim();
  const topic = String(pubsubTopic || "").trim();
  if (!id || !topic) {
    return { ok: false, error: "missing_account_or_topic" };
  }
  const name = `accounts/${id}/notificationSetting`;
  const url = `${NOTIFICATIONS}/${name}?updateMask=pubsubTopic,notificationTypes`;
  const body = {
    name,
    pubsubTopic: topic,
    notificationTypes: ["NEW_REVIEW", "UPDATED_REVIEW"],
  };
  const r = await jsonRequest(url, accessToken, "PATCH", body);
  if (!r.ok) {
    return {
      ok: false,
      error: r.data?.error?.message || r.data?.error?.status || r.error || "notif_enable_failed",
    };
  }
  return { ok: true, setting: r.data };
}
