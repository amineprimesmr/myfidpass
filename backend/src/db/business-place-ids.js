/**
 * Place Google déjà liés aux commerces dont l'utilisateur est propriétaire (`user_id`).
 * Sert à éviter les doublons et à filtrer l'autocomplete côté API.
 */
import { getDb } from "./connection.js";

const db = getDb();

/**
 * @param {string | null | undefined} jsonRaw
 * @returns {string}
 */
export function parseGooglePlaceIdFromEngagementRewardsJson(jsonRaw) {
  if (!jsonRaw || typeof jsonRaw !== "string") return "";
  try {
    const o = JSON.parse(jsonRaw);
    return String(o?.google_review?.place_id ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} userId
 * @returns {string[]}
 */
export function getOwnedGooglePlaceIdsByUserId(userId) {
  if (!userId) return [];
  const rows = db
    .prepare("SELECT engagement_rewards FROM businesses WHERE user_id = ?")
    .all(userId);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const pid = parseGooglePlaceIdFromEngagementRewardsJson(row?.engagement_rewards);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    out.push(pid);
  }
  return out;
}

/**
 * @param {string} userId
 * @param {string} placeId
 * @returns {boolean}
 */
export function userOwnsBusinessWithGooglePlaceId(userId, placeId) {
  const pid = String(placeId || "").trim();
  if (!userId || !pid) return false;
  return getOwnedGooglePlaceIdsByUserId(userId).includes(pid);
}
