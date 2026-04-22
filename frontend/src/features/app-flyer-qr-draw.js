/**
 * Rendu canvas des flyers QR (export PNG & aperçu).
 */
import {
  FLYER_EXPORT,
  FLYER_LAYOUT,
  FLYER_WHEEL_RADIUS_FRAC,
  footerStepsForegroundResolved,
  flyerLogoLayoutResolved,
} from "./app-flyer-qr-presets.js";
import { drawFlyerWheel } from "./app-flyer-wheel.js";
import { drawFlyerHeroHeadline, wrapCanvasTextLines } from "./app-flyer-qr-hero.js";
import { drawFlyerBackgroundLayer } from "./app-flyer-qr-draw-bg.js";
import flyerWheelTextureUrl from "../assets/flyer-wheels/spinflyer.png?url";

export { FLYER_EXPORT };

/**
 * Texture de roue (masque) — alignée sur l’asset `spinflyer` côté app (export 3x copié dans le bundle web).
 * Le fond IA n’est que le calque le plus bas ; logo, roue, titres et QR sont composés ici.
 */
export const FLYER_MANUAL_CANVAS_WHEEL_ENABLED = true;

/** @type {HTMLImageElement | "fail" | null} */
let flyerRoueCache = null;

/** Bandeau « étapes » pleine largeur (PNG, optionnel — fond transparent recommandé). */
const FLYER_FOOTER_BANNER_SRC = "/assets/flyer-footer-banner.png";

/**
 * Icônes PNG des étapes 1–2 (scan, roue). L’étape 3 est dessinée en canvas (étoile « gain ») — plus d’asset « cadeau ».
 */
const FLYER_STEP_ICON_SRCS = ["/assets/flyer-steps/icon-phone.png", "/assets/flyer-steps/icon-wheel.png"];

/** @type {HTMLImageElement | "fail" | null} */
let flyerFooterBannerCache = null;

/** @type {HTMLImageElement[] | "fail" | null} */
let flyerStepIconsCache = null;

async function getFlyerRoueImage() {
  if (flyerRoueCache === "fail") return null;
  if (flyerRoueCache) return flyerRoueCache;
  try {
    flyerRoueCache = await loadImage(flyerWheelTextureUrl, false);
    return flyerRoueCache;
  } catch {
    flyerRoueCache = "fail";
    return null;
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** @param {string} url @param {boolean} cors */
function loadImage(url, cors = true) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => {
      const done = () => resolve(im);
      if (typeof im.decode === "function") im.decode().then(done).catch(done);
      else done();
    };
    im.onerror = () => reject(new Error("image"));
    im.src = url;
  });
}

export function flyerQrImageUrl(targetUrl, sizePx) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&margin=10&data=${encodeURIComponent(targetUrl)}`;
}

/** QR en blob pour éviter canvas « tainted » à l’export PNG. */
async function loadQrAsImage(targetUrl, sizePx) {
  const u = flyerQrImageUrl(targetUrl, sizePx);
  try {
    const res = await fetch(u, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      return await loadImage(objUrl, false);
    } finally {
      try {
        URL.revokeObjectURL(objUrl);
      } catch (_) {}
    }
  } catch (_) {
    try {
      return await loadImage(u, true);
    } catch (_) {
      return null;
    }
  }
}

/**
 * Fond photo / IA : léger anneau sombre **sur le bord** de la zone roue (pas de halo clair au centre).
 * L’ancien dégradé blanc à r×0,06–0,35 sous les parts + anti-alias = « disque / moyeu » fantôme au milieu.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawFlyerWheelBackdropForBusyBg(ctx, cx, cy, r) {
  ctx.save();
  const rad = r * 1.14;
  const g = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, rad);
  g.addColorStop(0, "rgba(15,23,42,0)");
  g.addColorStop(0.5, "rgba(15,23,42,0.06)");
  g.addColorStop(1, "rgba(15,23,42,0.1)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Remplit le rectangle comme object-fit: cover (échelle uniforme, centré).
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
      } catch (_) {
        /* logo illisible pour le canvas */
      }
      return;
    }
    const scale = Math.max(dstW / sw, dstH / sh);
    const bw = sw * scale;
    const bh = sh * scale;
    const ox = dx + (dstW - bw) / 2;
    const oy = dy + (dstH - bh) / 2;
    try {
      /* Forme 5 params : la forme 9 params casse parfois (blob / SVG / WebKit). */
      ctx.drawImage(img, ox, oy, bw, bh);
    } catch (_) {
      try {
        drawStretch();
      } catch (_e) {
        /* ignore */
      }
    }
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = prevQ;
  }
}

/**
 * Comme object-fit: contain — tient entièrement dans le rectangle, centré.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dstW
 * @param {number} dstH
 */
function drawImageContain(ctx, img, dx, dy, dstW, dstH) {
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
    if (!sw || !sh) {
      try {
        ctx.drawImage(img, dx, dy, dstW, dstH);
      } catch (_) {}
      return;
    }
    const sc = Math.min(dstW / sw, dstH / sh);
    const bw = sw * sc;
    const bh = sh * sc;
    const ox = dx + (dstW - bw) / 2;
    const oy = dy + (dstH - bh) / 2;
    try {
      ctx.drawImage(img, ox, oy, bw, bh);
    } catch (_) {
      try {
        ctx.drawImage(img, dx, dy, dstW, dstH);
      } catch (_e) {}
    }
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = prevQ;
  }
}

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

/**
 * Moyenne RGB des pixels opaques dans un rectangle (pour estimer fond blanc / gris JPEG).
 * @param {Uint8ClampedArray} data
 * @param {number} pw
 * @param {number} ph
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{ r: number; g: number; b: number } | null}
 */
/**
 * Luminance relative (rec. 709 / sRGB) d’un pixel RVB linéarisé, 0–1.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function relativeLuminanceSrgb(r, g, b) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Luminance moyenne des pixels visibles (alpha > ~0.08), RGB dé-premultipliés — aligné sur l’heuristique iOS `FlyerLogoBackgroundPrepared`.
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @returns {number | null}
 */
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
      const r = Math.min(1, rp / ap);
      const g = Math.min(1, gp / ap);
      const b = Math.min(1, bp / ap);
      sum += relativeLuminanceSrgb(r, g, b);
      n++;
    }
  }
  if (n < 8) return null;
  return sum / n;
}

/**
 * Fond discret sous logo trop clair : teinte tirée des couleurs de fond flyer.
 * @param {Record<string, unknown>} s
 */
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

/**
 * Seuil au-dessus duquel on ajoute une plaque (même logique que l’export iOS ~0.78).
 */
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

/**
 * Cadre utile du logo : alpha + retrait des fonds opaques type JPEG (bloc blanc autour du motif).
 * @param {CanvasImageSource} img
 * @returns {{ sx: number; sy: number; sw: number; sh: number } | null}
 */
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
  /** Écart type couleur / fond : ignore les pixels « boîte blanche » sur JPEG. */
  const bgTol = 40;
  const isForeground = (i) => {
    const a = data[i + 3];
    if (a < 12) return false;
    if (a < 210) return true;
    if (!bg) return a > 14;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
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

/**
 * object-fit: contain avec découpe source.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dstW
 * @param {number} dstH
 * @param {number} sx
 * @param {number} sy
 * @param {number} sw
 * @param {number} sh
 */
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

/** Sous-échantillonnage depuis une grille haute résolution → logo plus net à l’export 2400px. */
const LOGO_DRAW_SUPER_SAMPLE = 2;

/**
 * Logo commerce en tête de flyer : détourage alpha + rendu 2× puis downscale.
 * Si le motif détouré est trop clair (luminance > ~0,78), plaque arrondie discrète
 * derrière le glyphe — cohérent avec l’abandon de détourage côté iOS pour les logos « tout blanc ».
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} logoImg
 * @param {number} w
 * @param {number} h
 * @param {Record<string, unknown>} s état flyer (mise en page logo, colorBgTop/Bottom)
 */
function drawFlyerCommerceLogo(ctx, logoImg, w, h, s) {
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
    const l = meanRelativeLuminanceOfOpaquePixels(id.data, tw, th);
    if (l != null && l > FLYER_LOGO_LIGHT_LUMA_THRESHOLD) {
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

async function getFlyerFooterBanner() {
  if (flyerFooterBannerCache === "fail") return null;
  if (flyerFooterBannerCache) return flyerFooterBannerCache;
  try {
    flyerFooterBannerCache = await loadImage(FLYER_FOOTER_BANNER_SRC, false);
    return flyerFooterBannerCache;
  } catch {
    flyerFooterBannerCache = "fail";
    return null;
  }
}

/** @returns {Promise<HTMLImageElement[] | null>} */
async function loadFooterStepIcons() {
  if (flyerStepIconsCache === "fail") return null;
  if (flyerStepIconsCache) return flyerStepIconsCache;
  /** @type {HTMLImageElement[]} */
  const imgs = [];
  for (const src of FLYER_STEP_ICON_SRCS) {
    try {
      imgs.push(await loadImage(src, false));
    } catch {
      flyerStepIconsCache = "fail";
      return null;
    }
  }
  flyerStepIconsCache = imgs;
  return imgs;
}

/**
 * Étape 3 : pictogramme vectoriel (étoile 8 branches) — remplace l’ancien PNG « cadeau ».
 * @param {string} fgCss couleur proche du texte étapes (ex. #e2e8f0)
 */
function drawFlyerFooterStepVectorStar(ctx, x, y, w, h, fgCss) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const outer = Math.min(w, h) * 0.46;
  const inner = outer * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, -outer * 0.2, inner * 0.1, 0, 0, outer);
  g.addColorStop(0, "#fefce8");
  g.addColorStop(0.45, fgCss);
  g.addColorStop(1, "#94a3b8");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = Math.max(1.2, outer * 0.06);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} canvasH @param {number} bottomY bord bas du bandeau étapes. @param {HTMLImageElement} img */
function drawFooterBanner(ctx, w, canvasH, bottomY, img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const maxH = canvasH * FLYER_LAYOUT.footerBannerMaxHeightFrac;
  const bleed = Math.max(2, Math.round(w * 0.003));
  const yTop = bottomY - maxH;
  // Full-bleed : l'image touche bien les bords gauche/droite du flyer.
  drawImageCover(ctx, img, -bleed, yTop, w + bleed * 2, maxH);
}

/**
 * Bandeau étapes avec icônes PNG (fond transparent — aucun rectangle de fond).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} canvasH
 * @param {number} bannerBottom bord bas de la zone étapes (= bas du canvas)
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {HTMLImageElement[]} icons
 */
function drawFooterStepsWithIcons(ctx, w, canvasH, bannerBottom, s, icons) {
  const fh = canvasH * FLYER_LAYOUT.footerStepsHeightFrac;
  const y0 = Math.max(0, bannerBottom - fh);
  const ft = Number(s.flyerFooterTextScalePct);
  const fsc = Number.isFinite(ft) ? Math.max(0.7, Math.min(1.35, ft / 100)) : 1;
  const fg = footerStepsForegroundResolved(s);
  const steps = [s.step1, s.step2, s.step3];
  const nums = ["1", "2", "3"];
  const cw = w / 3;
  const pad = cw * 0.035;

  for (let i = 0; i < 3; i++) {
    const x0 = i * cw;
    const iconW = cw * 0.38;
    const iconH = fh * 0.52;
    const iconRowCy = y0 + fh * 0.34;
    const iconX = x0 + pad;
    const iconY = iconRowCy - iconH / 2;

    if (i < 2 && icons[i]) {
      drawImageContain(ctx, icons[i], iconX, iconY, iconW, iconH);
    } else if (i === 2) {
      drawFlyerFooterStepVectorStar(ctx, iconX, iconY, iconW, iconH, fg);
    }

    const numSize = Math.round(fh * 0.38 * fsc);
    ctx.fillStyle = fg;
    ctx.font = `700 ${numSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const numX = iconX + iconW + cw * 0.025;
    ctx.fillText(nums[i], numX, iconRowCy);

    const cx = x0 + cw / 2;
    ctx.textAlign = "center";
    const fontPx = Math.round(fh * 0.09 * fsc);
    const lineH = Math.round(fh * 0.095 * fsc);
    ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = fg;
    wrapCenter(ctx, steps[i] || "", cx, y0 + fh * 0.78, cw * 0.85, lineH);
  }
}

/** Repli : ①②③ + textes (fond transparent). */
function drawFooterBar(ctx, w, h, s, bottomReserve = 0) {
  const fh = h * FLYER_LAYOUT.footerStepsHeightFrac;
  const y0 = Math.max(0, h - bottomReserve - fh);
  const ft = Number(s.flyerFooterTextScalePct);
  const fsc = Number.isFinite(ft) ? Math.max(0.7, Math.min(1.35, ft / 100)) : 1;
  const fg = footerStepsForegroundResolved(s);
  const steps = [s.step1, s.step2, s.step3];
  const icons = ["①", "②", "③"];
  const cw = w / 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 3; i++) {
    const cx = cw * i + cw / 2;
    const cy = y0 + fh * 0.5;
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(fh * 0.14 * fsc)}px Inter, system-ui, sans-serif`;
    ctx.fillText(icons[i], cx, cy - fh * 0.12);
    ctx.font = `600 ${Math.round(fh * 0.09 * fsc)}px Inter, system-ui, sans-serif`;
    const words = steps[i] || "";
    wrapCenter(ctx, words, cx, cy + fh * 0.1, cw * 0.85, Math.round(fh * 0.085 * fsc));
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} cx @param {number} cy @param {number} maxW @param {number} lineH */
function wrapCenter(ctx, text, cx, cy, maxW, lineH) {
  const lines = wrapCanvasTextLines(ctx, text, maxW);
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, cx, startY + i * lineH);
  });
}

/**
 * @param {string} raw
 * @returns {{ line1: string, line2: string }}
 */
function splitCtaBannerLines(raw) {
  const t = (raw || "").trim();
  if (!t) return { line1: "", line2: "" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { line1: parts[0].toUpperCase(), line2: "" };
  return {
    line1: parts[0].toUpperCase(),
    line2: parts.slice(1).join(" ").toUpperCase(),
  };
}

/**
 * Pastille « Scanne pour jouer » à gauche du QR — axe horizontal, 1re ligne plus grande (comme affiche papier).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
function drawFlyerQrCtaPill(ctx, s, qx, qy, qSize, scale) {
  const raw = (s.ctaBanner || "").trim();
  if (!raw) return;

  const { line1, line2 } = splitCtaBannerLines(raw);
  if (!line1) return;

  const padX = 44 * scale;
  const padY = 28 * scale;
  const lineGap = 8 * scale;

  const fontBig = Math.round(Math.min(132, Math.max(78, qSize * 0.31)));
  const fontSmall = line2 ? Math.round(fontBig * 0.58) : fontBig;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let maxW = 0;
  ctx.font = `800 ${fontBig}px Inter, system-ui, sans-serif`;
  maxW = Math.max(maxW, ctx.measureText(line1).width);
  if (line2) {
    ctx.font = `700 ${fontSmall}px Inter, system-ui, sans-serif`;
    maxW = Math.max(maxW, ctx.measureText(line2).width);
  }

  const pillW = maxW + padX * 2;
  const row1H = fontBig * 1.08;
  const row2H = line2 ? fontSmall * 1.1 : 0;
  const pillH = padY * 2 + row1H + (line2 ? lineGap + row2H : 0);

  const gap = -18 * scale;
  let pillLeft = qx - gap - pillW;
  const pillTop = qy + qSize * 0.7 - pillH / 2;
  const minX = 10 * scale;
  if (pillLeft < minX) {
    pillLeft = minX;
  }
  const rr = Math.min(32 * scale, pillH / 2);
  const fill = (s.ctaBannerBgColor && /^#[0-9A-Fa-f]{6}$/.test(String(s.ctaBannerBgColor).trim()))
    ? String(s.ctaBannerBgColor).trim()
    : "#ec4899";
  const textFill = (s.ctaTextColor && /^#[0-9A-Fa-f]{6}$/.test(String(s.ctaTextColor).trim()))
    ? String(s.ctaTextColor).trim()
    : "#ffffff";

  ctx.fillStyle = fill;
  roundRect(ctx, pillLeft, pillTop, pillW, pillH, rr);
  ctx.fill();

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(4, 8 * scale);
  roundRect(ctx, pillLeft, pillTop, pillW, pillH, rr);
  ctx.stroke();

  const cx = pillLeft + pillW / 2;
  let cy = pillTop + padY + row1H / 2;
  ctx.fillStyle = textFill;
  ctx.font = `800 ${fontBig}px Inter, system-ui, sans-serif`;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(1.5, 2.8 * scale);
  ctx.lineJoin = "round";
  ctx.strokeText(line1, cx, cy);
  ctx.fillText(line1, cx, cy);
  if (line2) {
    cy = pillTop + padY + row1H + lineGap + row2H / 2;
    ctx.font = `700 ${fontSmall}px Inter, system-ui, sans-serif`;
    ctx.strokeText(line2, cx, cy);
    ctx.fillText(line2, cx, cy);
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {string} qrTargetUrl
 * @param {ImageBitmap | HTMLImageElement | string | null | undefined} logoInput
 * @param {ImageBitmap | string | null | undefined} [bgInput] — image de fond (optionnel).
 */
export async function renderFlyerCanvas(canvas, s, qrTargetUrl, logoInput, bgInput) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, w, h);

  const scale = w / FLYER_EXPORT.w;
  /** QR un peu plus grand, coins plus ronds, QR serveur haute définition. */
  const qSize = w * 0.42;
  const qrCornerR = 50 * scale;
  const qrPad = 15 * scale;
  const qrInner = Math.max(1, qSize - 2 * qrPad);
  /** api.qrserver.com : au-delà de ~2400 px le fetch échoue souvent ; 2,75× suffit pour un QR net à l’export. */
  const qrFetchPx = Math.min(2400, Math.max(768, Math.round(qrInner * 2.75)));

  const [qrImg, roueImg] = await Promise.all([
    loadQrAsImage(qrTargetUrl, qrFetchPx),
    FLYER_MANUAL_CANVAS_WHEEL_ENABLED && s.wheelRenderMode === "png"
      ? getFlyerRoueImage()
      : Promise.resolve(null),
  ]);

  /** @type {CanvasImageSource | null} */
  let logoImg = null;
  if (logoInput && typeof ImageBitmap !== "undefined" && logoInput instanceof ImageBitmap) {
    logoImg = logoInput;
  } else if (
    logoInput &&
    typeof HTMLImageElement !== "undefined" &&
    logoInput instanceof HTMLImageElement &&
    (logoInput.complete ? logoInput.naturalWidth > 0 : true)
  ) {
    logoImg = logoInput;
  } else if (typeof logoInput === "string" && logoInput) {
    const isBlob = logoInput.startsWith("blob:");
    try {
      logoImg = await loadImage(logoInput, !isBlob);
    } catch (_) {
      if (!isBlob) {
        try {
          logoImg = await loadImage(logoInput, false);
        } catch (_e) {}
      }
    }
  }

  /** @type {CanvasImageSource | null} */
  let bgCanvasImg = null;
  if (bgInput && typeof ImageBitmap !== "undefined" && bgInput instanceof ImageBitmap) {
    bgCanvasImg = bgInput;
  } else if (typeof bgInput === "string" && bgInput) {
    const isBlob = bgInput.startsWith("blob:");
    try {
      bgCanvasImg = await loadImage(bgInput, !isBlob);
    } catch (_) {
      if (!isBlob) {
        try {
          bgCanvasImg = await loadImage(bgInput, false);
        } catch (_e) {}
      }
    }
  }

  const wheelCx = w * 0.5;
  const wheelCy = h * FLYER_LAYOUT.wheelCenterYFrac;
  const wheelR = w * FLYER_WHEEL_RADIUS_FRAC;

  drawFlyerBackgroundLayer(ctx, w, h, s, bgCanvasImg);
  const hasCommerceLogo = logoImg != null;
  if (hasCommerceLogo) {
    drawFlyerCommerceLogo(ctx, logoImg, w, h, s);
  }
  if (bgCanvasImg && FLYER_MANUAL_CANVAS_WHEEL_ENABLED) {
    drawFlyerWheelBackdropForBusyBg(ctx, wheelCx, wheelCy, wheelR);
  }
  if (FLYER_MANUAL_CANVAS_WHEEL_ENABLED) {
    drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover);
  }
  drawFlyerHeroHeadline(ctx, s, w, h, scale, hasCommerceLogo);
  const qx = w * 0.472;
  const qy = h * FLYER_LAYOUT.qrTopYFrac;
  const qCx = qx + qSize / 2;
  const qCy = qy + qSize / 2;
  /** Inclinaison très légère (~6°). */
  const qrTiltRad = (-6 * Math.PI) / 180;

  // La pastille passe légèrement derrière le QR (comme le mockup papier).
  drawFlyerQrCtaPill(ctx, s, qx, qy, qSize, scale);

  ctx.save();
  ctx.translate(qCx, qCy);
  ctx.rotate(qrTiltRad);
  ctx.translate(-qCx, -qCy);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qx, qy, qSize, qSize, qrCornerR);
  ctx.fill();
  if (qrImg) ctx.drawImage(qrImg, qx + qrPad, qy + qrPad, qrInner, qrInner);
  ctx.restore();
  const bannerBottom = h;
  const [stepIcons, footerBannerImg] = await Promise.all([loadFooterStepIcons(), getFlyerFooterBanner()]);
  if (footerBannerImg) {
    drawFooterBanner(ctx, w, h, bannerBottom, footerBannerImg);
  } else if (stepIcons && stepIcons.length >= 2) {
    drawFooterStepsWithIcons(ctx, w, h, bannerBottom, s, stepIcons);
  } else {
    drawFooterBar(ctx, w, h, s, 0);
  }
}
