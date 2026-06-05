/**
 * Pied de flyer (bandeau + étapes + fallback).
 */
import { FLYER_LAYOUT, FLYER_EXPORT, footerStepsForegroundResolved, flyerPrintSafeBottomY, flyerDesignScale } from "./app-flyer-qr-presets.js";
import { wrapCanvasTextLines } from "./app-flyer-qr-hero.js";
import { drawImageContain, drawImageCover, loadImage } from "./app-flyer-qr-draw-utils.js";

const FLYER_FOOTER_BANNER_SRC = "/assets/flyer-footer-banner.png";
const FLYER_STEP_ICON_SRCS = ["/assets/flyer-steps/icon-phone.png", "/assets/flyer-steps/icon-wheel.png"];
const MYFIDPASS_FLYER_LOGO_SRC = "/assets/icone.png?v=20260416";

/** @type {HTMLImageElement | "fail" | null} */
let flyerFooterBannerCache = null;
/** @type {HTMLImageElement[] | "fail" | null} */
let flyerStepIconsCache = null;
/** @type {HTMLImageElement | "fail" | null} */
let myfidpassFlyerLogoCache = null;

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

/** @returns {Promise<HTMLImageElement | null>} */
async function getMyfidpassFlyerLogo() {
  if (myfidpassFlyerLogoCache === "fail") return null;
  if (myfidpassFlyerLogoCache) return myfidpassFlyerLogoCache;
  try {
    myfidpassFlyerLogoCache = await loadImage(MYFIDPASS_FLYER_LOGO_SRC, false);
    return myfidpassFlyerLogoCache;
  } catch {
    myfidpassFlyerLogoCache = "fail";
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

function wrapCenter(ctx, text, cx, cy, maxW, lineH) {
  const lines = wrapCanvasTextLines(ctx, text, maxW);
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, cx, startY + i * lineH);
  });
}

/**
 * Texte blanc + contour noir net (export 4K / aperçu HD).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} font
 * @param {number} strokeW
 */
function drawFlyerPoweredByOutlinedText(ctx, text, x, y, font, strokeW) {
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.font = font;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const wOuter = Math.max(2, strokeW * 1.85);
  const wInner = Math.max(1.5, strokeW);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = wOuter;
  ctx.strokeText(text, px, py);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = wInner;
  ctx.strokeText(text, px, py);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, px, py);
}

function drawFooterBanner(ctx, w, canvasH, bottomY, img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const maxH = canvasH * FLYER_LAYOUT.footerBannerMaxHeightFrac;
  const bleed = Math.max(2, Math.round(w * 0.003));
  const yTop = bottomY - maxH;
  drawImageCover(ctx, img, -bleed, yTop, w + bleed * 2, maxH);
}

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

    if (i < 2 && icons[i]) drawImageContain(ctx, icons[i], iconX, iconY, iconW, iconH);
    else if (i === 2) drawFlyerFooterStepVectorStar(ctx, iconX, iconY, iconW, iconH, fg);

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
    wrapCenter(ctx, steps[i] || "", cx, cy + fh * 0.1, cw * 0.85, Math.round(fh * 0.085 * fsc));
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
export async function drawFlyerFooter(ctx, w, h, s) {
  const bottomY = flyerPrintSafeBottomY(h);
  const [stepIcons, footerBannerImg] = await Promise.all([loadFooterStepIcons(), getFlyerFooterBanner()]);
  if (footerBannerImg) {
    drawFooterBanner(ctx, w, h, bottomY, footerBannerImg);
  } else if (stepIcons && stepIcons.length >= 2) {
    drawFooterStepsWithIcons(ctx, w, h, bottomY, s, stepIcons);
  } else {
    drawFooterBar(ctx, w, h, s, h - bottomY);
  }
  await drawFlyerPoweredByBadge(ctx, w, h, bottomY);
}

/**
 * Mention Myfidpass en bas du flyer (export PNG 4096×6144 / aperçu HD).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {number} [bottomY]
 */
export async function drawFlyerPoweredByBadge(ctx, w, h, bottomY = h) {
  const img = await getMyfidpassFlyerLogo();
  const ds = flyerDesignScale(w);
  const fontPx = Math.max(44, Math.round(72 * ds));
  const gap = Math.max(14 * ds, w * 0.014);
  const iconH = Math.max(52, Math.round(90 * ds));
  const bannerMaxH = h * FLYER_LAYOUT.footerBannerMaxHeightFrac;
  const liftFrac = FLYER_LAYOUT.poweredByBadgeCenterFromBannerBottomFrac ?? 0.34;
  const yMid = Math.round(bottomY - bannerMaxH * Math.max(0.18, Math.min(0.52, liftFrac)));

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

  const label = "Propulsé par ";
  const brand = "Myfidpass";
  const labelFont = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  const brandFont = `800 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.font = labelFont;
  const labelW = ctx.measureText(label).width;
  ctx.font = brandFont;
  const brandW = ctx.measureText(brand).width;
  const imgW = img ? (iconH * ((img.naturalWidth || img.width) / (img.naturalHeight || img.height || 1))) : 0;
  const totalW = (img ? imgW + gap : 0) + labelW + brandW;
  let x = Math.round((w - totalW) / 2);
  const strokeW = Math.max(2.5, Math.round(5.5 * ds));

  if (img && imgW > 0) {
    const ix = Math.round(x);
    const iy = Math.round(yMid - iconH / 2);
    const iw = Math.round(imgW);
    const ih = Math.round(iconH);
    try {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.72)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = Math.max(1, Math.round(2.2 * ds));
      ctx.shadowOffsetY = Math.max(1, Math.round(2.2 * ds));
      ctx.globalAlpha = 1;
      ctx.drawImage(img, ix, iy, iw, ih);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.drawImage(img, ix, iy, iw, ih);
    } catch (_) {}
    x += iw + gap;
  }

  drawFlyerPoweredByOutlinedText(ctx, label, x, yMid, labelFont, strokeW);
  x += labelW;
  drawFlyerPoweredByOutlinedText(ctx, brand, x, yMid, brandFont, strokeW);
  ctx.restore();
}
