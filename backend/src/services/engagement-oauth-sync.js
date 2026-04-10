/**
 * Remplit les missions d’engagement (URLs profils publics) à partir des comptes OAuth connectés.
 */
import logger from "../lib/logger.js";
import { mergeEngagementRewardsUrlsFromOAuth } from "../db/engagement.js";

function instagramProfileUrl(username) {
  const h = String(username || "")
    .trim()
    .replace(/^@/, "");
  if (!h) return "";
  return `https://www.instagram.com/${encodeURIComponent(h)}/`;
}

function facebookPageUrl(pageId) {
  const id = String(pageId || "").trim();
  if (!id) return "";
  return `https://www.facebook.com/${encodeURIComponent(id)}`;
}

function tiktokProfileUrl(username) {
  const h = String(username || "")
    .trim()
    .replace(/^@/, "");
  if (!h) return "";
  return `https://www.tiktok.com/@${encodeURIComponent(h)}`;
}

/**
 * @param {string} channelId
 * @param {string} [customUrl] — snippet.customUrl YouTube (souvent @handle)
 */
function youtubeChannelUrl(channelId, customUrl) {
  const cu = String(customUrl || "").trim();
  if (cu) {
    const path = cu.startsWith("@") ? cu : `@${cu}`;
    return `https://www.youtube.com/${path}`;
  }
  const id = String(channelId || "").trim();
  if (!id) return "";
  return `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
}

/**
 * @param {string} businessId
 * @param {{ username?: string, facebookPageId?: string }} p
 */
export function syncEngagementUrlsFromMetaOAuth(businessId, p) {
  const patch = {};
  const ig = instagramProfileUrl(p.username);
  if (ig) patch.instagram_follow = ig;
  const fb = facebookPageUrl(p.facebookPageId);
  if (fb) patch.facebook_follow = fb;
  if (Object.keys(patch).length === 0) return { updated: false };
  const r = mergeEngagementRewardsUrlsFromOAuth(businessId, patch);
  if (r.updated) logger.info({ businessId, patch }, "[engagement-oauth-sync] meta");
  return r;
}

/**
 * @param {string} businessId
 * @param {{ channelId?: string, customUrl?: string }} p
 */
export function syncEngagementUrlFromYouTubeOAuth(businessId, p) {
  const url = youtubeChannelUrl(p.channelId, p.customUrl);
  if (!url) return { updated: false };
  const r = mergeEngagementRewardsUrlsFromOAuth(businessId, { youtube_follow: url });
  if (r.updated) logger.info({ businessId, url }, "[engagement-oauth-sync] youtube");
  return r;
}

/**
 * @param {string} businessId
 * @param {{ username?: string }} p
 */
export function syncEngagementUrlFromTikTokOAuth(businessId, p) {
  const url = tiktokProfileUrl(p.username);
  if (!url) return { updated: false };
  const r = mergeEngagementRewardsUrlsFromOAuth(businessId, { tiktok_follow: url });
  if (r.updated) logger.info({ businessId, url }, "[engagement-oauth-sync] tiktok");
  return r;
}
