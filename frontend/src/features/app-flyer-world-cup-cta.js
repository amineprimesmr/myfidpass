/**
 * Bandeau CTA flyer — mode Coupe du monde (pronostics activés).
 */
import { loadImage } from "./app-flyer-qr-draw-utils.js";

export const WORLD_CUP_CTA_BANNER_TEXT = "PRONOSTIQUEZ ET GAGNEZ";
export const WORLD_CUP_CTA_BG_SRC = "/assets/flyer/world-cup-cta-banner-bg.png";

/** @type {HTMLImageElement | null} */
let worldCupCtaBgCache = null;

/** @returns {Promise<HTMLImageElement | null>} */
export async function getWorldCupCtaBannerImage() {
  if (worldCupCtaBgCache) return worldCupCtaBgCache;
  try {
    worldCupCtaBgCache = await loadImage(WORLD_CUP_CTA_BG_SRC, false);
    return worldCupCtaBgCache;
  } catch (_) {
    return null;
  }
}

/**
 * @param {boolean | undefined | null} flag
 * @returns {boolean}
 */
export function isWorldCupFlyerCtaEnabled(flag) {
  return flag === true;
}

/**
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {{ matchPredictionsEnabled?: boolean }} [ctx]
 * @returns {string}
 */
export function effectiveCtaBannerText(s, ctx) {
  if (isWorldCupFlyerCtaEnabled(ctx?.matchPredictionsEnabled)) {
    return WORLD_CUP_CTA_BANNER_TEXT;
  }
  return String(s?.ctaBanner ?? "").trim();
}
