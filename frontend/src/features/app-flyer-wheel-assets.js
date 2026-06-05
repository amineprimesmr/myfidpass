/**
 * Assets roue / cadeau du flyer — chemins stables servis depuis `public/assets/flyer-wheels/`.
 * Source de vérité : `fidelity/frontend/public/assets/flyer-wheels/` (sync mobile via `npm run sync-flyer-assets`).
 */

export const FLYER_WHEEL_ASSETS_BASE = "/assets/flyer-wheels";

/** @param {string} fileName ex. `flyergame.png` */
export function flyerWheelAssetRelativeSrc(fileName) {
  const base = String(fileName || "").trim().replace(/^\/+/, "");
  if (!base || base.includes("..") || base.includes("/")) return "";
  return `${FLYER_WHEEL_ASSETS_BASE}/${base}`;
}

export const FLYER_WHEEL_FLYERGAME_SRC = flyerWheelAssetRelativeSrc("flyergame.png");
export const FLYER_WHEEL_GIFTFLYER_SRC = flyerWheelAssetRelativeSrc("giftflyer.png");

/**
 * Candidats de chargement (global iOS WK → URL absolue myfidpass.fr, puis chemin relatif embed).
 * @param {"flyergame.png"|"giftflyer.png"} fileName
 * @returns {string[]}
 */
export function flyerWheelAssetLoadCandidates(fileName) {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const rel = flyerWheelAssetRelativeSrc(fileName);
  /** @type {string[]} */
  const out = [];
  if (fileName === "flyergame.png") {
    for (const k of ["__FIDPASS_FLYERGAME_ASSET_URL", "__FIDPASS_FLYERGAME_DATA_URL"]) {
      const v = String(g[k] ?? "").trim();
      if (v) out.push(v);
    }
  }
  if (fileName === "giftflyer.png") {
    for (const k of ["__FIDPASS_GIFTFLYER_ASSET_URL", "__FIDPASS_GIFTFLYER_DATA_URL"]) {
      const v = String(g[k] ?? "").trim();
      if (v) out.push(v);
    }
  }
  if (rel) out.push(rel);
  return [...new Set(out)];
}
