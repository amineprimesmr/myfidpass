/**
 * Rendu canvas des flyers QR (export PNG & aperçu).
 */
import {
  FLYER_EXPORT,
  FLYER_LOGO_LAYOUT,
  FLYER_LAYOUT,
  footerStepsForegroundResolved,
} from "./app-flyer-qr-presets.js";
import {
  parseFlyerSocialEntries,
  flyerSocialStripHeight,
  drawFlyerSocialStrip,
} from "./app-flyer-social-strip.js";
import { drawFlyerWheel } from "./app-flyer-wheel.js";
import { drawFlyerHeroHeadline, wrapCanvasTextLines } from "./app-flyer-qr-hero.js";
import { drawFlyerBackgroundLayer } from "./app-flyer-qr-draw-bg.js";

export { FLYER_EXPORT };

/**
 * Roue dessinée par le canvas (PNG/segments + libellés).
 * Désactivé temporairement : le fond personnalisé (ex. image générée par l’IA) inclut déjà la roue ;
 * évite un doublon visuel. Remettre à `true` si on recompose une roue uniquement vectorielle.
 */
export const FLYER_MANUAL_CANVAS_WHEEL_ENABLED = false;

/** Bandeau « étapes » pleine largeur (PNG, optionnel — fond transparent recommandé). */
const FLYER_FOOTER_BANNER_SRC = "/assets/flyer-footer-banner.png";

/**
 * Icônes 3D des 3 étapes (PNG alpha, pas de texte dans l’image — le texte est dessiné en canvas).
 * Priorité : si les 3 fichiers chargent → composition icônes + chiffres + libellés ; sinon repli bandeau unique ou texte seul.
 */
const FLYER_STEP_ICON_SRCS = [
  "/assets/flyer-steps/icon-phone.png",
  "/assets/flyer-steps/icon-wheel.png",
  "/assets/flyer-steps/icon-gift.png",
];

/** Roue décorative (remplace le dessin vectoriel si le fichier est présent). */
const FLYER_ROUE_SRC = "/assets/roue.png";

/** @type {HTMLImageElement | "fail" | null} */
let flyerFooterBannerCache = null;

/** @type {HTMLImageElement[] | "fail" | null} */
let flyerStepIconsCache = null;

/** @type {HTMLImageElement | "fail" | null} */
let flyerRoueCache = null;

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

/**
 * Logo commerce en tête de flyer : pas de cercle ni bord, proportions respectées.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} logoImg
 * @param {number} w
 * @param {number} h
 */
function drawFlyerCommerceLogo(ctx, logoImg, w, h) {
  const maxW = w * FLYER_LOGO_LAYOUT.maxWFrac;
  const maxH = h * FLYER_LOGO_LAYOUT.maxHFrac;
  const cx = w * 0.5;
  const cy = h * FLYER_LOGO_LAYOUT.centerYFrac;
  const lx = cx - maxW / 2;
  const ly = cy - maxH / 2;
  drawImageContain(ctx, logoImg, lx, ly, maxW, maxH);
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

async function getFlyerRoueImage() {
  if (flyerRoueCache === "fail") return null;
  if (flyerRoueCache) return flyerRoueCache;
  try {
    flyerRoueCache = await loadImage(FLYER_ROUE_SRC, false);
    return flyerRoueCache;
  } catch {
    flyerRoueCache = "fail";
    return null;
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} canvasH @param {number} bottomY bord bas du bandeau (souvent h - bande sociale). @param {HTMLImageElement} img */
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
 * @param {number} bannerBottom bord bas de la zone étapes (= haut bande sociale si présente)
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

    drawImageContain(ctx, icons[i], iconX, iconY, iconW, iconH);

    const numSize = Math.round(fh * 0.38 * fsc);
    ctx.fillStyle = fg;
    ctx.font = `700 ${numSize}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const numX = iconX + iconW + cw * 0.025;
    ctx.fillText(nums[i], numX, iconRowCy);

    const cx = x0 + cw / 2;
    ctx.textAlign = "center";
    const fontPx = Math.round(fh * 0.09 * fsc);
    const lineH = Math.round(fh * 0.095 * fsc);
    ctx.font = `600 ${fontPx}px Outfit, system-ui, sans-serif`;
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
    ctx.font = `700 ${Math.round(fh * 0.14 * fsc)}px Outfit, system-ui, sans-serif`;
    ctx.fillText(icons[i], cx, cy - fh * 0.12);
    ctx.font = `600 ${Math.round(fh * 0.09 * fsc)}px Outfit, system-ui, sans-serif`;
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
  ctx.font = `800 ${fontBig}px Outfit, system-ui, sans-serif`;
  maxW = Math.max(maxW, ctx.measureText(line1).width);
  if (line2) {
    ctx.font = `700 ${fontSmall}px Outfit, system-ui, sans-serif`;
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

  ctx.fillStyle = fill;
  roundRect(ctx, pillLeft, pillTop, pillW, pillH, rr);
  ctx.fill();

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(3, 6 * scale);
  roundRect(ctx, pillLeft, pillTop, pillW, pillH, rr);
  ctx.stroke();

  const cx = pillLeft + pillW / 2;
  let cy = pillTop + padY + row1H / 2;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${fontBig}px Outfit, system-ui, sans-serif`;
  ctx.fillText(line1, cx, cy);
  if (line2) {
    cy = pillTop + padY + row1H + lineGap + row2H / 2;
    ctx.font = `700 ${fontSmall}px Outfit, system-ui, sans-serif`;
    ctx.fillText(line2, cx, cy);
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {string} qrTargetUrl
 * @param {ImageBitmap | string | null | undefined} logoInput — ImageBitmap préféré (évite blob + CORS).
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
  /** Carré QR un peu plus grand + ombre portée (relief). */
  const qSize = w * 0.395;
  const qrCornerR = 34 * scale;
  const qrPad = 16 * scale;
  const qrInner = Math.max(1, qSize - 2 * qrPad);
  const qrFetchPx = Math.min(2048, Math.max(512, Math.round(qrInner * 2)));

  const qrImg = await loadQrAsImage(qrTargetUrl, qrFetchPx);
  const roueImg = FLYER_MANUAL_CANVAS_WHEEL_ENABLED ? await getFlyerRoueImage() : null;

  /** @type {CanvasImageSource | null} */
  let logoImg = null;
  if (logoInput && typeof ImageBitmap !== "undefined" && logoInput instanceof ImageBitmap) {
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
  const wheelR = w * 0.36;

  drawFlyerBackgroundLayer(ctx, w, h, s, bgCanvasImg);
  // Le logo de tête est désormais porté par le fond (IA / visuel importé), pas par l'éditeur flyer.
  if (FLYER_MANUAL_CANVAS_WHEEL_ENABLED) {
    drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover);
  }
  drawFlyerHeroHeadline(ctx, s, w, h, scale, false);
  const qx = w * 0.472;
  const qy = h * FLYER_LAYOUT.qrTopYFrac;
  const qCx = qx + qSize / 2;
  const qCy = qy + qSize / 2;
  /** Légère inclinaison (sens inverse des aiguilles d’une montre), ~11°. */
  const qrTiltRad = (-11 * Math.PI) / 180;

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
  const socialEntries = parseFlyerSocialEntries(s);
  const stripH = flyerSocialStripHeight(h, socialEntries.length);
  const bannerBottom = h - stripH;
  const [stepIcons, footerBannerImg] = await Promise.all([loadFooterStepIcons(), getFlyerFooterBanner()]);
  if (footerBannerImg) {
    drawFooterBanner(ctx, w, h, bannerBottom, footerBannerImg);
  } else if (stepIcons && stepIcons.length === 3) {
    drawFooterStepsWithIcons(ctx, w, h, bannerBottom, s, stepIcons);
  } else {
    drawFooterBar(ctx, w, h, s, stripH);
  }
  await drawFlyerSocialStrip(ctx, w, h - stripH, stripH, socialEntries, s);
}
