/**
 * OAuth Google (scopes YouTube) — abonnés chaîne via YouTube Data API v3.
 * Réutilise GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (même console Google que la connexion compte).
 */
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/config.js";
import logger from "../lib/logger.js";

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

export function getYouTubeRedirectUri() {
  const base = (process.env.API_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/api/oauth/google-youtube/callback`;
}

export function isYouTubeOAuthConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function signYouTubeOAuthState({ businessId, slug }) {
  return jwt.sign(
    { typ: "youtube_oauth", bid: businessId, slug: String(slug || "").trim() },
    getJwtSecret(),
    { expiresIn: "15m" },
  );
}

export function verifyYouTubeOAuthState(token) {
  try {
    const p = jwt.verify(String(token || ""), getJwtSecret());
    if (p.typ !== "youtube_oauth" || !p.bid || !p.slug) return null;
    return { businessId: String(p.bid), slug: String(p.slug) };
  } catch (_) {
    return null;
  }
}

export function buildGoogleYouTubeAuthorizeUrl(redirectUri, state) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set(
    "scope",
    ["https://www.googleapis.com/auth/youtube.readonly", "openid", "email"].join(" "),
  );
  u.searchParams.set("state", state);
  return u.toString();
}

async function postForm(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export async function exchangeYouTubeAuthorizationCode(code, redirectUri) {
  const r = await postForm("https://oauth2.googleapis.com/token", {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!r.ok || !r.data?.access_token) {
    logger.warn({ data: r.data }, "[youtube-oauth] token exchange");
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

export async function refreshYouTubeAccessToken(refreshToken) {
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

/**
 * @returns {Promise<{ ok: boolean, error?: string, channelId?: string, subscriberCount?: number }>}
 */
export async function fetchYouTubeChannelStats(accessToken) {
  const u = new URL("https://www.googleapis.com/youtube/v3/channels");
  u.searchParams.set("part", "statistics,snippet");
  u.searchParams.set("mine", "true");
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.items?.[0]) {
    return { ok: false, error: data.error?.message || "channels_failed" };
  }
  const ch = data.items[0];
  const subs = Number(ch.statistics?.subscriberCount);
  const channelId = String(ch.id || "");
  const title = String(ch.snippet?.title || "").trim();
  const customUrl = String(ch.snippet?.customUrl || "").trim();
  if (!channelId) return { ok: false, error: "no_channel" };
  if (!Number.isFinite(subs)) return { ok: false, error: "no_subscriber_count" };
  return { ok: true, channelId, subscriberCount: subs, channelTitle: title, customUrl };
}
