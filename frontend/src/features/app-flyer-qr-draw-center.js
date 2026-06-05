import {
  FLYER_WHEEL_FLYERGAME_SRC,
  flyerWheelAssetLoadCandidates,
} from "./app-flyer-wheel-assets.js";
import { drawImageWithFlyergameFit, loadImage } from "./app-flyer-qr-draw-utils.js";

/** @type {HTMLImageElement | null} */
let flyergameCenterCache = null;

export async function getFlyergameCenterImage() {
  if (flyergameCenterCache) return flyergameCenterCache;
  try {
    const runtimeFlyergame = String(globalThis?.__FIDPASS_FLYERGAME_DATA_URL || "").trim();
    if (runtimeFlyergame) {
      const fromRuntime = await loadImage(runtimeFlyergame, false);
      if (fromRuntime) {
        flyergameCenterCache = fromRuntime;
        return flyergameCenterCache;
      }
    }
    const candidates = flyerWheelAssetLoadCandidates("flyergame.png");
    for (const src of candidates) {
      const looksOk =
        src.startsWith("data:image/") ||
        src.startsWith("blob:") ||
        /^https?:/i.test(src) ||
        src.startsWith("/");
      if (!looksOk) continue;
      try {
        flyergameCenterCache = await loadImage(src, false);
        if (flyergameCenterCache) return flyergameCenterCache;
      } catch (_) {}
    }
    if (FLYER_WHEEL_FLYERGAME_SRC) {
      flyergameCenterCache = await loadImage(FLYER_WHEEL_FLYERGAME_SRC, false);
    }
    return flyergameCenterCache;
  } catch {
    return null;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} wheelR
 * @param {CanvasImageSource | null} img
 */
export function drawFlyergameCenter(ctx, cx, cy, wheelR, img) {
  if (!img) return;
  const o = /** @type {{ naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }} */ (img);
  const sw = o.naturalWidth || o.width || 0;
  const sh = o.naturalHeight || o.height || 0;
  if (!sw || !sh) return;
  // Image gameflyer encore plus grande.
  const fitBox = wheelR * 2.35;
  const x = cx - fitBox / 2;
  const y = cy - fitBox / 2;
  ctx.save();
  // Rendu normal pour conserver le fond/relief original de l'image.
  drawImageWithFlyergameFit(ctx, img, x, y, fitBox, fitBox);
  ctx.restore();
}
