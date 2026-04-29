/**
 * Fond du flyer : dégradé seul ou photo + voile (couleurs fond haut/bas).
 */

/**
 * @param {string} hex #rrggbb
 * @param {number} a 0–1
 */
function hexToRgba(hex, a) {
  const h = (hex || "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return `rgba(15,23,42,${a})`;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * @param {{ colorPrimary?: string; colorBgTop?: string; colorBgBottom?: string }} s
 * @returns {string}
 */
function resolveFlyerBaseBgHex(s) {
  const top = String(s?.colorBgTop || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(top)) return top;
  const bot = String(s?.colorBgBottom || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(bot)) return bot;
  const primary = String(s?.colorPrimary || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(primary)) return primary;
  return "#1f2937";
}

function hexToRgbTuple(hex) {
  const h = String(hex || "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return [31, 41, 55];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function rgbToHex(r, g, b) {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

function lightenHex(hex, amount = 0.16) {
  const [r, g, b] = hexToRgbTuple(hex);
  const a = Math.max(0, Math.min(0.45, amount));
  return rgbToHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
}

function darkenHex(hex, amount = 0.24) {
  const [r, g, b] = hexToRgbTuple(hex);
  const a = Math.max(0, Math.min(0.55, amount));
  return rgbToHex(r * (1 - a), g * (1 - a), b * (1 - a));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {string} top
 * @param {string} bot
 */
function fillGradientVOpaque(ctx, w, h, top, bot) {
  const baseHex = resolveFlyerBaseBgHex({ colorPrimary: top || bot, colorBgTop: top, colorBgBottom: bot });
  const coreHex = lightenHex(baseHex, 0.14);
  const edgeHex = darkenHex(baseHex, 0.3);
  const rg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.05, w * 0.5, h * 0.5, Math.max(w, h) * 0.84);
  rg.addColorStop(0, coreHex);
  rg.addColorStop(0.38, baseHex);
  rg.addColorStop(1, edgeHex);
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  const centerGlow = ctx.createRadialGradient(w * 0.5, h * 0.48, h * 0.03, w * 0.5, h * 0.48, h * 0.54);
  centerGlow.addColorStop(0, "rgba(255,255,255,0.2)");
  centerGlow.addColorStop(0.52, "rgba(255,255,255,0.09)");
  centerGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, w, h);
  const edgeShade = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
  edgeShade.addColorStop(0, "rgba(0,0,0,0)");
  edgeShade.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, w, h);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dstW
 * @param {number} dstH
 */
function drawImageCover(ctx, img, dx, dy, dstW, dstH) {
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQ = "imageSmoothingQuality" in ctx ? ctx.imageSmoothingQuality : "low";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  try {
    let sw = 0;
    let sh = 0;
    if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
      sw = img.width;
      sh = img.height;
    } else if (img && typeof img === "object") {
      const o = /** @type {{ naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }} */ (img);
      sw = o.naturalWidth || o.width || 0;
      sh = o.naturalHeight || o.height || 0;
    }
    const drawStretch = () => {
      ctx.drawImage(img, dx, dy, dstW, dstH);
    };
    if (!sw || !sh) {
      try {
        drawStretch();
      } catch (_) {}
      return;
    }
    const scale = Math.max(dstW / sw, dstH / sh);
    const bw = sw * scale;
    const bh = sh * scale;
    const ox = dx + (dstW - bw) / 2;
    const oy = dy + (dstH - bh) / 2;
    try {
      ctx.drawImage(img, ox, oy, bw, bh);
    } catch (_) {
      try {
        drawStretch();
      } catch (_e) {}
    }
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = prevQ;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ colorBgTop: string; colorBgBottom: string; flyerBgOverlayPct?: number }} s
 * @param {CanvasImageSource | null} bgImg
 */
export function drawFlyerBackgroundLayer(ctx, w, h, s, bgImg) {
  if (!bgImg) {
    const skip =
      typeof window !== "undefined" &&
      window.__FIDPASS_SKIP_CANVAS_BG_FILL === true;
    if (skip) {
      /** Fond affiché sous la WKWebView (UIImage natif) — pas de dégradé par défaut. */
      return;
    }
    const base = resolveFlyerBaseBgHex(s);
    fillGradientVOpaque(ctx, w, h, base, base);
    return;
  }
  drawImageCover(ctx, bgImg, 0, 0, w, h);
  const raw = Number(s.flyerBgOverlayPct);
  const pct = Number.isFinite(raw) ? Math.max(0, Math.min(90, Math.round(raw))) : 0;
  if (pct <= 0) return;
  const t = (pct / 100) * 0.88;
  const b = (pct / 100) * 0.95;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hexToRgba(s.colorBgTop, t));
  g.addColorStop(1, hexToRgba(s.colorBgBottom, b));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
