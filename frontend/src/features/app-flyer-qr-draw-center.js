import flyergameDataUrl from "../assets/flyer-wheels/flyergame.png?inline";
import { drawImageWithFlyergameFit, loadImage } from "./app-flyer-qr-draw-utils.js";

const FLYERGAME_PUBLIC_SRC = "/assets/flyergame.png";

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
    const candidates = [String(flyergameDataUrl || "").trim(), FLYERGAME_PUBLIC_SRC]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
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
    return null;
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
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  try {
    drawImageWithFlyergameFit(ctx, img, x, y, fitBox, fitBox, "contain");
  } catch (_) {}
  ctx.restore();
}
