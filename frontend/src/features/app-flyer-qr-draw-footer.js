/**
 * Pied de flyer (bandeau + étapes + fallback).
 */
import { FLYER_LAYOUT, FLYER_EXPORT, footerStepsForegroundResolved } from "./app-flyer-qr-presets.js";
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
  const [stepIcons, footerBannerImg] = await Promise.all([loadFooterStepIcons(), getFlyerFooterBanner()]);
  if (footerBannerImg) {
    drawFooterBanner(ctx, w, h, h, footerBannerImg);
  } else if (stepIcons && stepIcons.length >= 2) {
    drawFooterStepsWithIcons(ctx, w, h, h, s, stepIcons);
  } else {
    drawFooterBar(ctx, w, h, s, 0);
  }
  await drawFlyerPoweredByBadge(ctx, w, h);
}

/**
 * Mention discrète Myfidpass en bas du flyer (export PNG / aperçu).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export async function drawFlyerPoweredByBadge(ctx, w, h) {
  const img = await getMyfidpassFlyerLogo();
  const scale = w / FLYER_EXPORT.w;
  const bottomPad = Math.max(10 * scale, h * 0.004);
  const yBase = h - bottomPad;
  const fontPx = Math.max(10, Math.round(20 * scale));
  const gap = Math.max(6 * scale, w * 0.008);
  const iconH = Math.max(14, Math.round(26 * scale));

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${fontPx}px Inter, system-ui, sans-serif`;
  const label = "Propulsé par ";
  const brand = "Myfidpass";
  const labelW = ctx.measureText(label).width;
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
  const brandW = ctx.measureText(brand).width;
  const imgW = img ? (iconH * ((img.naturalWidth || img.width) / (img.naturalHeight || img.height || 1))) : 0;
  const totalW = (img ? imgW + gap : 0) + labelW + brandW;
  let x = (w - totalW) / 2;
  const yMid = yBase - fontPx * 0.45;

  if (img && imgW > 0) {
    try {
      ctx.globalAlpha = 0.58;
      ctx.drawImage(img, x, yMid - iconH / 2, imgW, iconH);
    } catch (_) {}
    x += imgW + gap;
  }

  ctx.globalAlpha = 0.52;
  ctx.font = `500 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = "#475569";
  ctx.textAlign = "left";
  ctx.fillText(label, x, yMid);
  x += labelW;
  ctx.globalAlpha = 0.62;
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = "#334155";
  ctx.fillText(brand, x, yMid);
  ctx.restore();
}
