/**
 * Médias commerce (logo, fond carte, etc.) hors ligne `businesses` pour éviter un SELECT * lourd.
 * Référence : perf mobile + cache HTTP.
 */
import { getDb } from "./connection.js";

const db = getDb();

/** @type {Record<string, string>} */
export const ASSET_KIND_TO_FLAG = {
  logo: "asset_logo_present",
  logo_icon: "asset_logo_icon_present",
  card_background: "asset_card_background_present",
  stamp_icon: "asset_stamp_icon_present",
};

/**
 * @param {string} businessId
 * @param {"logo"|"logo_icon"|"card_background"|"stamp_icon"} kind
 * @returns {string|null}
 */
export function getBusinessAssetData(businessId, kind) {
  if (!businessId || !kind) return null;
  const row = db.prepare("SELECT data FROM business_assets WHERE business_id = ? AND kind = ?").get(businessId, kind);
  return row?.data != null ? String(row.data) : null;
}

/**
 * Une seule requête pour PassKit / merge (évite 4 allers-retours SQLite).
 * @returns {{ logo: string|null, logo_icon: string|null, card_background: string|null, stamp_icon: string|null }}
 */
export function getAllBusinessAssetsMap(businessId) {
  const empty = { logo: null, logo_icon: null, card_background: null, stamp_icon: null };
  if (!businessId) return empty;
  const rows = db.prepare("SELECT kind, data FROM business_assets WHERE business_id = ?").all(businessId);
  const out = { ...empty };
  for (const r of rows) {
    const k = r.kind;
    if (k in out && r.data != null) out[k] = String(r.data);
  }
  return out;
}

/**
 * @param {string} businessId
 * @param {"logo"|"logo_icon"|"card_background"|"stamp_icon"} kind
 * @param {string|null|undefined} data - data URL ou null pour supprimer
 */
export function setBusinessAssetData(businessId, kind, data) {
  if (!businessId || !kind) return;
  const flagCol = ASSET_KIND_TO_FLAG[kind];
  if (!flagCol) return;

  const run = db.transaction(() => {
    if (data == null || data === "") {
      db.prepare("DELETE FROM business_assets WHERE business_id = ? AND kind = ?").run(businessId, kind);
      db.prepare(`UPDATE businesses SET ${flagCol} = 0 WHERE id = ?`).run(businessId);
    } else {
      db.prepare(
        `INSERT INTO business_assets (business_id, kind, data) VALUES (?, ?, ?)
         ON CONFLICT(business_id, kind) DO UPDATE SET data = excluded.data`,
      ).run(businessId, kind, String(data));
      db.prepare(`UPDATE businesses SET ${flagCol} = 1 WHERE id = ?`).run(businessId);
    }
  });
  run();
}

/**
 * Fusionne les blobs sur l’objet business pour generatePass / PassKit (lecture ciblée uniquement).
 * @param {Record<string, unknown>|null|undefined} business
 */
export function mergeBusinessAssetsForPass(business) {
  if (!business?.id) return business;
  const id = String(business.id);
  const a = getAllBusinessAssetsMap(id);
  return {
    ...business,
    logo_base64: a.logo ?? business.logo_base64 ?? null,
    logo_icon_base64: a.logo_icon ?? business.logo_icon_base64 ?? null,
    card_background_base64: a.card_background ?? business.card_background_base64 ?? null,
    stamp_icon_base64: a.stamp_icon ?? business.stamp_icon_base64 ?? null,
  };
}
