/**
 * Rendu canvas des flyers QR (export PNG & aperçu).
 */
import {
  FLYER_EXPORT,
  FLYER_LAYOUT,
  FLYER_WHEEL_RADIUS_FRAC,
} from "./app-flyer-qr-presets.js";
import { drawFlyerWheel, drawFlyerWheelLabelsOverlay } from "./app-flyer-wheel.js";
import { drawFlyerHeroHeadline } from "./app-flyer-qr-hero.js";
import { drawFlyerBackgroundLayer } from "./app-flyer-qr-draw-bg.js";
import {
  loadQrAsImage,
  loadImage,
  resolveCanvasImageInput,
  roundRect,
} from "./app-flyer-qr-draw-utils.js";
import { getFlyergameCenterImage, drawFlyergameCenter } from "./app-flyer-qr-draw-center.js";
import { drawFlyerFooter } from "./app-flyer-qr-draw-footer.js";
import { drawFlyerCommerceLogo } from "./app-flyer-qr-draw-logo.js";
import giftflyerDataUrl from "../assets/flyer-wheels/giftflyer.png?inline";

export { FLYER_EXPORT };

/** @type {HTMLCanvasElement | null} */
let flyerWorkCanvasCache = null;
/** @type {HTMLImageElement | null} */
let flyerGiftflyerCache = null;

async function getFlyerGiftflyerImage() {
  if (flyerGiftflyerCache) return flyerGiftflyerCache;
  try {
    const src = String(giftflyerDataUrl || "").trim();
    if (!src) return null;
    flyerGiftflyerCache = await loadImage(src, false);
    return flyerGiftflyerCache;
  } catch {
    return null;
  }
}

function drawFlyerGiftflyerPromo(ctx, w, h, scale, img) {
  if (!img) return;
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) return;
  const giftW = w * 0.48;
  const giftH = (giftW * sh) / sw;
  const lead = Math.max(8 * scale, w * 0.02);
  const bottomPad = Math.max(4 * scale, h * 0.01);
  const lift = Math.max(126 * scale, h * 0.19);
  const x = lead;
  const y = h - bottomPad - giftH - lift;
  try {
    ctx.drawImage(img, x, y, giftW, giftH);
  } catch (_) {}
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
 * @param {HTMLCanvasElement} canvas — surface visible ; mise à jour en un seul blit à la fin (évite le flash en WKWebView).
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {string} qrTargetUrl
 * @param {ImageBitmap | HTMLImageElement | string | null | undefined} logoInput
 * @param {ImageBitmap | string | null | undefined} [bgInput] — image de fond (optionnel).
 * @param {object} [options]
 * @param {() => boolean} [options.shouldBlit] — si la fonction retourne `false` au moment du blit, on n’écrase pas l’image (render obsolète).
 */
export async function renderFlyerCanvas(canvas, s, qrTargetUrl, logoInput, bgInput, options) {
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return;
  /** Tout le dessin sur un buffer : pas de `clearRect` sur le canvas visible pendant les `await` (évite l’écran vide). */
  const work = flyerWorkCanvasCache || /** @type {HTMLCanvasElement} */ (document.createElement("canvas"));
  flyerWorkCanvasCache = work;
  if (work.width !== w || work.height !== h) {
    work.width = w;
    work.height = h;
  }
  const ctx = work.getContext("2d");
  if (!ctx) return;
  // Important pour le mode app iOS (underlay natif): quand le fond canvas est volontairement
  // ignoré (__FIDPASS_SKIP_CANVAS_BG_FILL=true), on doit repartir d'une surface transparente.
  // Sinon les pixels de la frame précédente restent et s'accumulent (ombres/voiles qui montent).
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

  const scale = w / FLYER_EXPORT.w;
  /** QR un peu plus grand, coins plus ronds, QR serveur haute définition. */
  const qSize = w * 0.42;
  const qrCornerR = 50 * scale;
  const qrPad = 15 * scale;
  const qrInner = Math.max(1, qSize - 2 * qrPad);
  /** api.qrserver.com : au-delà de ~2400 px le fetch échoue souvent ; 2,75× suffit pour un QR net à l’export. */
  const qrFetchPx = Math.min(2400, Math.max(768, Math.round(qrInner * 2.75)));

  const [qrImg, flyergameImg, giftflyerImg] = await Promise.all([
    loadQrAsImage(qrTargetUrl, qrFetchPx),
    getFlyergameCenterImage(),
    getFlyerGiftflyerImage(),
  ]);

  const [logoImg, bgCanvasImg] = await Promise.all([
    resolveCanvasImageInput(logoInput),
    resolveCanvasImageInput(bgInput),
  ]);

  /** Centre roue / moyeu : léger décalage vers la droite (alignement visuel sur la texture). */
  const wheelCx = w * (0.5 + 0.013);
  const wheelCy = h * FLYER_LAYOUT.wheelCenterYFrac;
  const wheelR = w * FLYER_WHEEL_RADIUS_FRAC;
  /**
   * Roue couleur nettement plus grande (demandé): elle devient l'élément principal,
   * puis l'overlay graphique se pose au centre seulement.
   */
  const spinnerR = Math.max(340 * scale, Math.min(wheelR * 0.7, w * 0.47));

  drawFlyerBackgroundLayer(ctx, w, h, s, bgCanvasImg);
  const hasCommerceLogo = logoImg != null;
  if (hasCommerceLogo) {
    drawFlyerCommerceLogo(ctx, logoImg, w, h, s);
  }
  // gameflyer d'abord, puis couleurs en masque au-dessus de l'image.
  drawFlyergameCenter(ctx, wheelCx, wheelCy, spinnerR, flyergameImg);
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = 0.62;
  drawFlyerWheel(ctx, s, wheelCx, wheelCy, spinnerR);
  ctx.restore();
  // Rendre les textes de la roue bien visibles (opaques, au-dessus du masque).
  drawFlyerWheelLabelsOverlay(ctx, s, wheelCx, wheelCy, spinnerR);
  drawFlyerGiftflyerPromo(ctx, w, h, scale, giftflyerImg);
  drawFlyerHeroHeadline(ctx, s, w, h, scale, hasCommerceLogo);
  const qx = w * 0.472;
  const qy = h * FLYER_LAYOUT.qrTopYFrac;
  const qCx = qx + qSize / 2;
  const qCy = qy + qSize / 2;
  /** Inclinaison très légère (~6°). */
  const qrTiltRad = (-6 * Math.PI) / 180;

  // Pastille **au-dessus** de l’illustration cadeau ; légèrement derrière le QR.
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
  await drawFlyerFooter(ctx, w, h, s);

  if (options && typeof options.shouldBlit === "function" && !options.shouldBlit()) {
    return;
  }
  const vctx = canvas.getContext("2d");
  if (!vctx) return;
  vctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in vctx) vctx.imageSmoothingQuality = "high";
  vctx.clearRect(0, 0, w, h);
  vctx.drawImage(work, 0, 0, w, h, 0, 0, w, h);
}
