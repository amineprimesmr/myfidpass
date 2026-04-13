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
const BUSINESS_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const MY_BUSINESS_V4 = "https://mybusiness.googleapis.com/v4";

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
    return {
      ok: false,
      error: r.error || r.data?.error?.message || r.data?.error?.status || "accounts_failed",
    };
  }
  const accounts = r.data.accounts || [];
  const accountNames = accounts.map((a) => a.name).filter(Boolean);
  return { ok: true, accountNames };
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
    return {
      ok: false,
      error: r.error || r.data?.error?.message || r.data?.error?.status || "locations_failed",
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
 * @param {string} preferredPlaceId - place_id Maps côté engagement
 */
export async function resolveGoogleBusinessLocation(accessToken, preferredPlaceId) {
  const want = String(preferredPlaceId || "").trim();
  const acc = await listGoogleBusinessAccounts(accessToken);
  if (!acc.ok) return acc;

  const allLocs = [];
  for (const accountName of acc.accountNames) {
    const loc = await listGoogleBusinessLocations(accessToken, accountName);
    if (!loc.ok) continue;
    for (const L of loc.locations) {
      allLocs.push({ accountName, location: L });
    }
  }
  if (allLocs.length === 0) {
    return { ok: false, error: "no_locations" };
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
