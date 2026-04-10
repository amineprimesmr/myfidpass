/**
 * OAuth TikTok (Login Kit) — stats profil dont follower_count.
 * Docs : developers.tiktok.com — URI redirect à déclarer sur l’appli TikTok.
 */
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/config.js";
import logger from "../lib/logger.js";

const TIKTOK_CLIENT_KEY = (process.env.TIKTOK_CLIENT_KEY || "").trim();
const TIKTOK_CLIENT_SECRET = (process.env.TIKTOK_CLIENT_SECRET || "").trim();

export function getTikTokRedirectUri() {
  const base = (process.env.API_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/api/oauth/tiktok/callback`;
}

export function isTikTokOAuthConfigured() {
  return !!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET);
}

export function signTikTokOAuthState({ businessId, slug }) {
  return jwt.sign(
    { typ: "tiktok_oauth", bid: businessId, slug: String(slug || "").trim() },
    getJwtSecret(),
    { expiresIn: "15m" },
  );
}

export function verifyTikTokOAuthState(token) {
  try {
    const p = jwt.verify(String(token || ""), getJwtSecret());
    if (p.typ !== "tiktok_oauth" || !p.bid || !p.slug) return null;
    return { businessId: String(p.bid), slug: String(p.slug) };
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} redirectUri — identique à l’URI enregistrée sur TikTok Developer Portal
 */
export function buildTikTokAuthorizeUrl(redirectUri, state) {
  const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
  u.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "user.info.basic,user.info.stats");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeTikTokAuthorizationCode(code, redirectUri) {
  const body = {
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const tok = data.access_token || data.data?.access_token;
  if (!res.ok || !tok) {
    logger.warn({ status: res.status, data }, "[tiktok-oauth] token");
    return { ok: false, error: data.error?.message || data.message || "token_exchange_failed" };
  }
  const refresh = data.refresh_token || data.data?.refresh_token || null;
  const expiresIn = Number(data.expires_in ?? data.data?.expires_in) || 86400;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const openId = data.open_id || data.data?.open_id || null;
  return { ok: true, accessToken: tok, refreshToken: refresh, expiresAt, openId: openId ? String(openId) : null };
}

export async function refreshTikTokAccessToken(refreshToken) {
  const body = {
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const tok = data.access_token || data.data?.access_token;
  if (!res.ok || !tok) {
    return { ok: false, error: data.error?.message || "refresh_failed" };
  }
  const expiresIn = Number(data.expires_in ?? data.data?.expires_in) || 86400;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { ok: true, accessToken: tok, expiresAt };
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, openId?: string, followerCount?: number }>}
 */
export async function fetchTikTokUserStats(accessToken) {
  const u = new URL("https://open.tiktokapis.com/v2/user/info/");
  u.searchParams.set("fields", "open_id,display_name,follower_count,following_count");
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  const user = data.data?.user || data.user || data.data;
  const openId = user?.open_id || user?.union_id || data.open_id;
  const fc = user?.follower_count ?? user?.followerCount;
  const n = Number(fc);
  if (!res.ok || !Number.isFinite(n)) {
    logger.warn({ data }, "[tiktok-oauth] user info");
    return { ok: false, error: data.error?.message || data.message || "user_info_failed" };
  }
  return { ok: true, openId: openId ? String(openId) : "", followerCount: n };
}
