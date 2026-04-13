/**
 * Connexions OAuth réseaux (Meta / Instagram, futurs fournisseurs).
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

export const PROVIDER_META_INSTAGRAM = "meta_instagram";
/** Même jeton Meta : métrique Page Facebook (fans) — pas de ligne OAuth séparée. */
export const PROVIDER_GOOGLE_YOUTUBE = "google_youtube";
/** Fiche Google Business Profile — avis en direct (API v4). */
export const PROVIDER_GOOGLE_BUSINESS = "google_business";
export const PROVIDER_TIKTOK = "tiktok";

/** Canaux dont le suivi repose sur OAuth (pas de saisie manuelle côté produit). */
export const OAUTH_PROVIDER_BY_CHANNEL = {
  instagram_follow: PROVIDER_META_INSTAGRAM,
  facebook_follow: PROVIDER_META_INSTAGRAM,
  youtube_follow: PROVIDER_GOOGLE_YOUTUBE,
  tiktok_follow: PROVIDER_TIKTOK,
};

/**
 * @param {object} row
 * @param {string} row.businessId
 * @param {string} row.provider
 * @param {string} row.accessToken
 * @param {string|null} row.refreshToken
 * @param {string|null} row.tokenExpiresAt - ISO
 * @param {string|null} row.externalUserId - IG user id
 * @param {object|null} row.metadata
 */
export function upsertSocialOAuthConnection(row) {
  const existing = getSocialOAuthConnection(row.businessId, row.provider);
  const id = existing?.id || randomUUID();
  const meta = row.metadata && typeof row.metadata === "object" ? JSON.stringify(row.metadata) : null;
  db.prepare(`DELETE FROM social_oauth_connections WHERE business_id = ? AND provider = ?`).run(row.businessId, row.provider);
  db.prepare(
    `INSERT INTO social_oauth_connections (
       id, business_id, provider, access_token, refresh_token, token_expires_at,
       external_user_id, metadata_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  ).run(
    id,
    row.businessId,
    row.provider,
    row.accessToken,
    row.refreshToken ?? null,
    row.tokenExpiresAt ?? null,
    row.externalUserId ?? null,
    meta,
  );
  return getSocialOAuthConnection(row.businessId, row.provider);
}

export function getSocialOAuthConnection(businessId, provider) {
  return db
    .prepare(`SELECT * FROM social_oauth_connections WHERE business_id = ? AND provider = ?`)
    .get(businessId, provider);
}

export function deleteSocialOAuthConnection(businessId, provider) {
  db.prepare(`DELETE FROM social_oauth_connections WHERE business_id = ? AND provider = ?`).run(businessId, provider);
}
