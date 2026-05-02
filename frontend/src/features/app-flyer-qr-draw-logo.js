/**
 * Rendu logo commerce (détourage + correction fond clair + halo).
 */
import { flyerLogoLayoutResolved } from "./app-flyer-qr-presets.js";
import { drawImageContain, roundRect } from "./app-flyer-qr-draw-utils.js";

/** @param {CanvasImageSource} img */
function logoSourceDimensions(img) {
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
    return { sw: img.width, sh: img.height };
  }
  if (img && typeof img === "object") {
    const o = /** @type {{ naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }} */ (img);
    const sw = o.naturalWidth || o.width || 0;
    const sh = o.naturalHeight || o.height || 0;
    return { sw, sh };
  }
  return { sw: 0, sh: 0 };
}

function relativeLuminanceSrgb(r, g, b) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function meanRelativeLuminanceOfOpaquePixels(data, w, h) {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      const ap = data[i + 3] / 255;
      if (ap < 0.08) continue;
      const rp = data[i] / 255;
      const gp = data[i + 1] / 255;
      const bp = data[i + 2] / 255;
      const rr = Math.min(1, rp / ap);
      const gg = Math.min(1, gp / ap);
      const bb = Math.min(1, bp / ap);
      sum += relativeLuminanceSrgb(rr, gg, bb);
      n++;
    }
  }
  if (n < 8) return null;
  return sum / n;
}

function flyerLogoContrastPlateStyle(s) {
  const top = typeof s?.colorBgTop === "string" ? s.colorBgTop.trim() : "";
  const bot = typeof s?.colorBgBottom === "string" ? s.colorBgBottom.trim() : "";
  const hex = /^#[0-9A-Fa-f]{6}$/.test(top) ? top : /^#[0-9A-Fa-f]{6}$/.test(bot) ? bot : "";
  if (hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${Math.round(r * 0.15 + 12)},${Math.round(g * 0.15 + 12)},${Math.round(b * 0.15 + 14)},0.92)`;
  }
  return "rgba(17,24,39,0.9)";
}

const FLYER_LOGO_LIGHT_LUMA_THRESHOLD = 0.78;

function sampleOpaqueAverageRgb(data, pw, ph, x0, y0, x1, y1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const xMin = Math.max(0, x0);
  const yMin = Math.max(0, y0);
  const xMax = Math.min(pw, x1);
  const yMax = Math.min(ph, y1);
  for (let y = yMin; y < yMax; y++) {
    const row = y * pw * 4;
    for (let x = xMin; x < xMax; x++) {
      const i = row + x * 4;
      if (data[i + 3] > 200) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  if (n < 4) return null;
  return { r: r / n, g: g / n, b: b / n };
}

function applyFlyerCommerceLogoBackgroundKnockoutFromImageData(id, w, h) {
  const d = id.data;
  const depth = Math.max(2, Math.min(14, Math.round(Math.min(w, h) * 0.06)));
  const cornerTL = sampleOpaqueAverageRgb(d, w, h, 0, 0, depth, depth);
  const cornerTR = sampleOpaqueAverageRgb(d, w, h, w - depth, 0, w, depth);
  const cornerBL = sampleOpaqueAverageRgb(d, w, h, 0, h - depth, depth, h);
  const cornerBR = sampleOpaqueAverageRgb(d, w, h, w - depth, h - depth, w, h);
  const corners = [cornerTL, cornerTR, cornerBL, cornerBR].filter(Boolean);
  if (corners.length < 2) return;
  const bg = {
    r: corners.reduce((s, p) => s + p.r, 0) / corners.length,
    g: corners.reduce((s, p) => s + p.g, 0) / corners.length,
    b: corners.reduce((s, p) => s + p.b, 0) / corners.length,
  };
  if (bg.r + bg.g + bg.b < 400) return;
  const tol = 48;
  let edgeN = 0;
  let edgeM = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 10) continue;
      edgeN += 1;
      if (Math.hypot(d[i] - bg.r, d[i + 1] - bg.g, d[i + 2] - bg.b) < tol) edgeM += 1;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 10) continue;
      edgeN += 1;
      if (Math.hypot(d[i] - bg.r, d[i + 1] - bg.g, d[i + 2] - bg.b) < tol) edgeM += 1;
    }
  }
  if (edgeN < 8) return;
  if (edgeM / edgeN < 0.18) return;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] < 8) continue;
      if (Math.hypot(d[o] - bg.r, d[o + 1] - bg.g, d[o + 2] - bg.b) < tol) {
        d[o] = 0;
        d[o + 1] = 0;
        d[o + 2] = 0;
        d[o + 3] = 0;
      }
    }
  }
}

function computeLogoContentBounds(img) {
  if (typeof document === "undefined") return null;
  const { sw, sh } = logoSourceDimensions(img);
  if (!sw || !sh) return null;
  const maxProbe = 480;
  const scale = Math.min(1, maxProbe / Math.max(sw, sh));
  const pw = Math.max(1, Math.round(sw * scale));
  const ph = Math.max(1, Math.round(sh * scale));
  const canv = document.createElement("canvas");
  canv.width = pw;
  canv.height = ph;
  const c2 = canv.getContext("2d", { willReadFrequently: true });
  if (!c2) return null;
  try {
    c2.drawImage(img, 0, 0, pw, ph);
  } catch {
    return null;
  }
  let data;
  try {
    data = c2.getImageData(0, 0, pw, ph).data;
  } catch {
    return null;
  }
  const depth = Math.max(2, Math.min(14, Math.round(Math.min(pw, ph) * 0.06)));
  const cornerTL = sampleOpaqueAverageRgb(data, pw, ph, 0, 0, depth, depth);
  const cornerTR = sampleOpaqueAverageRgb(data, pw, ph, pw - depth, 0, pw, depth);
  const cornerBL = sampleOpaqueAverageRgb(data, pw, ph, 0, ph - depth, depth, ph);
  const cornerBR = sampleOpaqueAverageRgb(data, pw, ph, pw - depth, ph - depth, pw, ph);
  /** @type {{ r: number; g: number; b: number } | null} */
  let bg = null;
  const corners = [cornerTL, cornerTR, cornerBL, cornerBR].filter(Boolean);
  if (corners.length >= 2) {
    bg = {
      r: corners.reduce((s, p) => s + p.r, 0) / corners.length,
      g: corners.reduce((s, p) => s + p.g, 0) / corners.length,
      b: corners.reduce((s, p) => s + p.b, 0) / corners.length,
    };
  }
  const bgTol = 40;
  const isForeground = (i) => {
    const a = data[i + 3];
    if (a < 12) return false;
    if (a < 210) return true;
    if (!bg) return a > 14;
    const rr = data[i];
    const gg = data[i + 1];
    const bb = data[i + 2];
    const dist = Math.hypot(rr - bg.r, gg - bg.g, bb - bg.b);
    return dist > bgTol;
  };
  let minX = pw;
  let minY = ph;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < ph; y++) {
    const row = y * pw * 4;
    for (let x = 0; x < pw; x++) {
      const i = row + x * 4;
      if (isForeground(i)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  const padP = Math.max(1, Math.round(Math.min(pw, ph) * 0.012));
  minX = Math.max(0, minX - padP);
  minY = Math.max(0, minY - padP);
  maxX = Math.min(pw - 1, maxX + padP);
  maxY = Math.min(ph - 1, maxY + padP);
  const sx0 = Math.floor((minX * sw) / pw);
  const sy0 = Math.floor((minY * sh) / ph);
  const sx1 = Math.ceil(((maxX + 1) * sw) / pw);
  const sy1 = Math.ceil(((maxY + 1) * sh) / ph);
  const padS = Math.max(0, Math.round(Math.min(sw, sh) * 0.008));
  const sx = Math.max(0, sx0 - padS);
  const sy = Math.max(0, sy0 - padS);
  const sww = Math.min(sw - sx, sx1 - sx0 + 2 * padS);
  const shh = Math.min(sh - sy, sy1 - sy0 + 2 * padS);
  if (sww < 2 || shh < 2) return null;
  return { sx, sy, sw: sww, sh: shh };
}

function drawImageContainCropped(ctx, img, dx, dy, dstW, dstH, sx, sy, sw, sh) {
  if (!sw || !sh) {
    drawImageContain(ctx, img, dx, dy, dstW, dstH);
    return;
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQ = "imageSmoothingQuality" in ctx ? ctx.imageSmoothingQuality : "low";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  try {
    const sc = Math.min(dstW / sw, dstH / sh);
    const bw = sw * sc;
    const bh = sh * sc;
    const ox = dx + (dstW - bw) / 2;
    const oy = dy + (dstH - bh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, ox, oy, bw, bh);
  } catch {
    drawImageContain(ctx, img, dx, dy, dstW, dstH);
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = prevQ;
  }
}

const LOGO_DRAW_SUPER_SAMPLE = 2;

export function drawFlyerCommerceLogo(ctx, logoImg, w, h, s) {
  const L = flyerLogoLayoutResolved(s);
  const maxW = w * L.maxWFrac;
  const maxH = h * L.maxHFrac;
  const cx = w * 0.5;
  const cy = h * L.centerYFrac;
  const lx = cx - maxW / 2;
  const ly = cy - maxH / 2;

  const { sw: fullW, sh: fullH } = logoSourceDimensions(logoImg);
  const crop = computeLogoContentBounds(logoImg);
  const sx = crop?.sx ?? 0;
  const sy = crop?.sy ?? 0;
  const srw = crop?.sw ?? fullW;
  const srh = crop?.sh ?? fullH;

  const tw = Math.max(2, Math.round(maxW * LOGO_DRAW_SUPER_SAMPLE));
  const th = Math.max(2, Math.round(maxH * LOGO_DRAW_SUPER_SAMPLE));
  if (typeof document === "undefined") {
    drawImageContainCropped(ctx, logoImg, lx, ly, maxW, maxH, sx, sy, srw, srh);
    return;
  }
  const off = document.createElement("canvas");
  off.width = tw;
  off.height = th;
  const octx = off.getContext("2d");
  if (!octx) {
    drawImageContainCropped(ctx, logoImg, lx, ly, maxW, maxH, sx, sy, srw, srh);
    return;
  }
  octx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in octx) octx.imageSmoothingQuality = "high";
  drawImageContainCropped(octx, logoImg, 0, 0, tw, th, sx, sy, srw, srh);

  let id;
  try {
    id = octx.getImageData(0, 0, tw, th);
  } catch {
    id = null;
  }
  if (id) {
    applyFlyerCommerceLogoBackgroundKnockoutFromImageData(id, tw, th);
    octx.putImageData(id, 0, 0);
    const l = meanRelativeLuminanceOfOpaquePixels(id.data, tw, th);
    // Pastille de contraste : utile pour un logo **photo opaque** sur fond clair (`flyerLogoKeepSourceBackground: true`).
    // Si `false` (détourage app / PNG transparent), ne pas dessiner de plaque : `flyerLogoContrastPlateStyle` reprend
    // `colorBgTop` / `colorBgBottom` — avec un dégradé noir (réglage utilisateur) on obtenait un **carré noir** derrière le logo.
    const keepSourceBg = s?.flyerLogoKeepSourceBackground === true;
    if (keepSourceBg && l != null && l > FLYER_LOGO_LIGHT_LUMA_THRESHOLD) {
      const m = Math.min(tw, th) * 0.04;
      const rad = Math.min(tw, th) * 0.1;
      octx.clearRect(0, 0, tw, th);
      octx.fillStyle = flyerLogoContrastPlateStyle(s);
      roundRect(octx, m, m, tw - 2 * m, th - 2 * m, rad);
      octx.fill();
      octx.putImageData(id, 0, 0);
    }
  }

  const glow = Math.max(8, maxW * 0.028);
  const dropY = Math.max(2, maxH * 0.028);
  const dropBlur = Math.max(6, maxW * 0.026);
  const filterStr = `drop-shadow(0 ${dropY}px ${dropBlur}px rgba(0,0,0,0.44)) drop-shadow(0 0 ${glow}px rgba(255,255,255,0.22))`;

  ctx.save();
  try {
    ctx.filter = filterStr;
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, 0, 0, tw, th, lx, ly, maxW, maxH);
  } catch {
    ctx.filter = "none";
    ctx.drawImage(off, 0, 0, tw, th, lx, ly, maxW, maxH);
  }
  ctx.filter = "none";
  ctx.restore();
}
