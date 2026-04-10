/**
 * OAuth Meta (Facebook Login) → compte Instagram professionnel / créateur lié à une Page.
 * Docs : Instagram Graph API, champs followers_count (compte IG lié à une Page Facebook).
 */
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/config.js";
import logger from "../lib/logger.js";

const META_APP_ID = (process.env.META_APP_ID || "").trim();
const META_APP_SECRET = (process.env.META_APP_SECRET || "").trim();
const GRAPH_VERSION = "v21.0";

/** URL publique de l’API (Railway) — doit correspondre au redirect Meta. */
export function getDefaultMetaRedirectUri() {
  const base = (process.env.API_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/api/oauth/meta/callback`;
}

export function isMetaOAuthConfigured() {
  return !!(META_APP_ID && META_APP_SECRET);
}

export function signMetaOAuthState({ businessId, slug }) {
  return jwt.sign(
    { typ: "meta_oauth", bid: businessId, slug: String(slug || "").trim() },
    getJwtSecret(),
    { expiresIn: "15m" },
  );
}

export function verifyMetaOAuthState(token) {
  try {
    const p = jwt.verify(String(token || ""), getJwtSecret());
    if (p.typ !== "meta_oauth" || !p.bid || !p.slug) return null;
    return { businessId: String(p.bid), slug: String(p.slug) };
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} redirectUri - identique à l’URI enregistrée sur l’app Meta
 * @param {string} state - JWT
 */
export function buildFacebookOAuthAuthorizeUrl(redirectUri, state) {
  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "business_management",
  ].join(",");
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", META_APP_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", scopes);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Échange le code OAuth contre un jeton court, puis long (60 j).
 */
export async function exchangeAuthorizationCode(code, redirectUri) {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  u.searchParams.set("client_id", META_APP_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("client_secret", META_APP_SECRET);
  u.searchParams.set("code", code);
  const shortTok = await fetchJson(u.toString());
  if (!shortTok.ok || !shortTok.data?.access_token) {
    logger.warn({ status: shortTok.status, data: shortTok.data }, "[meta-oauth] short token failed");
    return { ok: false, error: shortTok.data?.error?.message || "token_exchange_failed" };
  }
  const short = shortTok.data.access_token;

  const longUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", META_APP_ID);
  longUrl.searchParams.set("client_secret", META_APP_SECRET);
  longUrl.searchParams.set("fb_exchange_token", short);
  const longTok = await fetchJson(longUrl.toString());
  if (!longTok.ok || !longTok.data?.access_token) {
    return { ok: false, error: longTok.data?.error?.message || "long_token_failed" };
  }
  const expiresIn = Number(longTok.data.expires_in) || 5184000;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { ok: true, accessToken: longTok.data.access_token, expiresAt };
}

/**
 * Récupère le premier compte Instagram Business lié à une Page gérée par l’utilisateur.
 */
export async function fetchInstagramBusinessFromUserToken(userAccessToken) {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  u.searchParams.set("fields", "name,access_token,instagram_business_account{id,username}");
  u.searchParams.set("access_token", userAccessToken);
  const acc = await fetchJson(u.toString());
  if (!acc.ok || !Array.isArray(acc.data?.data)) {
    return { ok: false, error: acc.data?.error?.message || "me_accounts_failed" };
  }
  for (const page of acc.data.data) {
    const ig = page.instagram_business_account;
    if (ig && ig.id) {
      const pageToken = page.access_token;
      const igId = ig.id;
      const igUserUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${igId}`);
      igUserUrl.searchParams.set("fields", "followers_count,username");
      igUserUrl.searchParams.set("access_token", pageToken);
      const igRes = await fetchJson(igUserUrl.toString());
      const followers = Number(igRes.data?.followers_count);
      const username = String(igRes.data?.username || ig.username || "").trim();
      if (!igRes.ok || !Number.isFinite(followers)) {
        logger.warn({ igRes: igRes.data }, "[meta-oauth] followers fetch");
        return { ok: false, error: igRes.data?.error?.message || "followers_fetch_failed" };
      }
      return {
        ok: true,
        igUserId: igId,
        username,
        followersCount: followers,
        pageAccessToken: pageToken,
        facebookPageId: page.id || null,
        pageName: page.name || null,
      };
    }
  }
  return { ok: false, error: "no_instagram_business_account" };
}

export async function refreshFollowersFromStoredUserToken(userAccessToken, igUserId) {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  u.searchParams.set("fields", "access_token,instagram_business_account{id}");
  u.searchParams.set("access_token", userAccessToken);
  const acc = await fetchJson(u.toString());
  if (!acc.ok || !Array.isArray(acc.data?.data)) {
    return { ok: false, error: acc.data?.error?.message || "me_accounts_failed" };
  }
  for (const page of acc.data.data) {
    const ig = page.instagram_business_account;
    if (ig && String(ig.id) === String(igUserId)) {
      const pageToken = page.access_token;
      const igUserUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}`);
      igUserUrl.searchParams.set("fields", "followers_count,username");
      igUserUrl.searchParams.set("access_token", pageToken);
      const igRes = await fetchJson(igUserUrl.toString());
      const followers = Number(igRes.data?.followers_count);
      if (!igRes.ok || !Number.isFinite(followers)) {
        return { ok: false, error: igRes.data?.error?.message || "followers_refresh_failed" };
      }
      return { ok: true, followersCount: followers, username: String(igRes.data?.username || "").trim() };
    }
  }
  return { ok: false, error: "page_not_found_for_ig" };
}

/**
 * Fans de la Page Facebook (Graph API) — jeton Page requis.
 */
export async function fetchFacebookPageFanCount(pageId, pageAccessToken) {
  if (!pageId || !pageAccessToken) return { ok: false, error: "missing_page" };
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}`);
  u.searchParams.set("fields", "fan_count");
  u.searchParams.set("access_token", pageAccessToken);
  const res = await fetchJson(u.toString());
  const n = Number(res.data?.fan_count);
  if (!res.ok || !Number.isFinite(n)) {
    return { ok: false, error: res.data?.error?.message || "fan_count_failed" };
  }
  return { ok: true, fanCount: n };
}

/**
 * Rafraîchit le nombre de fans Page à partir du jeton utilisateur Meta (même connexion qu’Instagram).
 */
export async function refreshFacebookFanFromMetaUserToken(userAccessToken, facebookPageId) {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  u.searchParams.set("fields", "id,access_token");
  u.searchParams.set("access_token", userAccessToken);
  const acc = await fetchJson(u.toString());
  if (!acc.ok || !Array.isArray(acc.data?.data)) {
    return { ok: false, error: acc.data?.error?.message || "me_accounts_failed" };
  }
  const page = acc.data.data.find((p) => String(p.id) === String(facebookPageId));
  if (!page?.access_token) return { ok: false, error: "page_not_found" };
  return fetchFacebookPageFanCount(facebookPageId, page.access_token);
}
