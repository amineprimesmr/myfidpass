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
  return {
    ...business,
    logo_base64: getBusinessAssetData(id, "logo") ?? business.logo_base64 ?? null,
    logo_icon_base64: getBusinessAssetData(id, "logo_icon") ?? business.logo_icon_base64 ?? null,
    card_background_base64: getBusinessAssetData(id, "card_background") ?? business.card_background_base64 ?? null,
    stamp_icon_base64: getBusinessAssetData(id, "stamp_icon") ?? business.stamp_icon_base64 ?? null,
  };
}
