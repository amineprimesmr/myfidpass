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
  const primary = String(s?.colorPrimary || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(primary)) return primary;
  const top = String(s?.colorBgTop || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(top)) return top;
  const bot = String(s?.colorBgBottom || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(bot)) return bot;
  return "#1f2937";
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {string} top
 * @param {string} bot
 */
function fillGradientVOpaque(ctx, w, h, top, bot) {
  const topHex = /^#[0-9A-Fa-f]{6}$/.test(String(top || "").trim()) ? top : "#334155";
  const botHex = /^#[0-9A-Fa-f]{6}$/.test(String(bot || "").trim()) ? bot : "#0f172a";
  const g = ctx.createLinearGradient(w * 0.1, 0, w * 0.9, h);
  g.addColorStop(0, topHex);
  g.addColorStop(0.45, topHex);
  g.addColorStop(1, botHex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Glow principal centré/haut pour profondeur.
  const centerGlow = ctx.createRadialGradient(w * 0.52, h * 0.44, h * 0.04, w * 0.52, h * 0.44, h * 0.66);
  centerGlow.addColorStop(0, "rgba(255,255,255,0.2)");
  centerGlow.addColorStop(0.5, "rgba(255,255,255,0.09)");
  centerGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, w, h);
  // Halo diagonal pour casser l'effet "plat".
  const diagGlow = ctx.createLinearGradient(w * 0.08, h * 0.02, w * 0.92, h * 0.98);
  diagGlow.addColorStop(0, "rgba(255,255,255,0.07)");
  diagGlow.addColorStop(0.5, "rgba(255,255,255,0)");
  diagGlow.addColorStop(1, "rgba(0,0,0,0.07)");
  ctx.fillStyle = diagGlow;
  ctx.fillRect(0, 0, w, h);
  // Vignette globale : bords plus foncés tout autour.
  const edgeShade = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.86);
  edgeShade.addColorStop(0, "rgba(0,0,0,0)");
  edgeShade.addColorStop(1, "rgba(0,0,0,0.28)");
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
    fillGradientVOpaque(ctx, w, h, s?.colorBgTop || base, s?.colorBgBottom || base);
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
