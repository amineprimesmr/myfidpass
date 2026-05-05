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

/**
 * Recherche globale d'un commerce lié à un place_id Google (tous comptes confondus).
 * @param {string} placeId
 * @param {{ excludeBusinessId?: string | null }} [options]
 * @returns {{ id: string, user_id: string | null, name: string | null, slug: string | null } | null}
 */
export function getAnyBusinessLinkedToGooglePlaceId(placeId, options = {}) {
  const pid = String(placeId || "").trim();
  if (!pid) return null;
  const excludeBusinessId = String(options?.excludeBusinessId || "").trim();
  const rows = db
    .prepare("SELECT id, user_id, name, slug, engagement_rewards FROM businesses")
    .all();
  for (const row of rows) {
    if (!row?.id) continue;
    if (excludeBusinessId && String(row.id).trim() === excludeBusinessId) continue;
    const linkedPid = parseGooglePlaceIdFromEngagementRewardsJson(row.engagement_rewards);
    if (linkedPid && linkedPid === pid) {
      return {
        id: String(row.id),
        user_id: row.user_id ? String(row.user_id) : null,
        name: row.name ? String(row.name) : null,
        slug: row.slug ? String(row.slug) : null,
      };
    }
  }
  return null;
}
