/**
 * Rendu canvas des flyers QR (export PNG & aperçu).
 */
import { FLYER_EXPORT } from "./app-flyer-qr-presets.js";

export { FLYER_EXPORT };

/** Bandeau « étapes » en bas du flyer (fichier dans public/). */
const FLYER_FOOTER_BANNER_SRC = "/assets/flyer-footer-banner.png";

/** @type {HTMLImageElement | "fail" | null} */
let flyerFooterBannerCache = null;

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

/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r @param {string} a @param {string} b */
function drawWheel(ctx, cx, cy, r, a, b) {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const t1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, t0, t1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(2, r * 0.02);
  ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {string} top @param {string} bot */
function fillGradientV(ctx, w, h, top, bot) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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
}

/**
 * Logo dans le disque : rendu sur patch puis copie (évite bugs clip × drawImage sur blob/WebKit).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} logoImg
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} scale
 */
function drawLogoCircle(ctx, logoImg, cx, cy, r, scale) {
  const side = r * 2;
  const lx = cx - r;
  const ly = cy - r;
  const sidePx = Math.max(1, Math.round(side));
  let patch;
  if (typeof OffscreenCanvas !== "undefined") {
    patch = new OffscreenCanvas(sidePx, sidePx);
  } else {
    patch = document.createElement("canvas");
    patch.width = sidePx;
    patch.height = sidePx;
  }
  const pctx = patch.getContext("2d");
  if (pctx) {
    drawImageCover(pctx, logoImg, 0, 0, sidePx, sidePx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(patch, lx, ly, side, side);
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawImageCover(ctx, logoImg, lx, ly, side, side);
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
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

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {HTMLImageElement} img */
function drawFooterBanner(ctx, w, h, img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const drawW = w;
  let drawH = (drawW * ih) / iw;
  const maxH = h * 0.28;
  if (drawH > maxH) {
    drawH = maxH;
    const drawW2 = (drawH * iw) / ih;
    const x0 = (w - drawW2) / 2;
    ctx.drawImage(img, x0, h - drawH, drawW2, drawH);
    return;
  }
  ctx.drawImage(img, 0, h - drawH, drawW, drawH);
}

/** @param {import("./app-flyer-qr-presets.js").FlyerState} s */
function drawFooterBar(ctx, w, h, s, dark) {
  const fh = h * 0.2;
  const y0 = h - fh;
  ctx.fillStyle = dark ? "#0a0a0a" : "#1e293b";
  ctx.fillRect(0, y0, w, fh);
  const steps = [s.step1, s.step2, s.step3];
  const icons = ["①", "②", "③"];
  const cw = w / 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 3; i++) {
    const cx = cw * i + cw / 2;
    const cy = y0 + fh * 0.5;
    ctx.fillStyle = dark ? s.colorPrimary : "#94a3b8";
    ctx.font = `700 ${Math.round(fh * 0.14)}px Outfit, system-ui, sans-serif`;
    ctx.fillText(icons[i], cx, cy - fh * 0.12);
    ctx.fillStyle = dark ? "#f1f5f9" : "#f8fafc";
    ctx.font = `600 ${Math.round(fh * 0.09)}px Outfit, system-ui, sans-serif`;
    const words = steps[i] || "";
    wrapCenter(ctx, words, cx, cy + fh * 0.1, cw * 0.85, Math.round(fh * 0.085));
  }
  if (s.footerSocial?.trim()) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `500 ${Math.round(fh * 0.07)}px Outfit, system-ui, sans-serif`;
    ctx.fillText(s.footerSocial.trim(), w / 2, y0 + fh - fh * 0.12);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} cx @param {number} cy @param {number} maxW @param {number} lineH */
function wrapCenter(ctx, text, cx, cy, maxW, lineH) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, cx, startY + i * lineH);
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {string} qrTargetUrl
 * @param {ImageBitmap | string | null | undefined} logoInput — ImageBitmap préféré (évite blob + CORS).
 */
export async function renderFlyerCanvas(canvas, s, qrTargetUrl, logoInput) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  const scale = w / FLYER_EXPORT.w;
  const qrPx = Math.round(420 * scale);

  const qrImg = await loadQrAsImage(qrTargetUrl, Math.min(800, Math.round(qrPx * 2)));

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

  fillGradientV(ctx, w, h, s.colorBgTop, s.colorBgBottom);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, w * 0.04, h * 0.03, w * 0.92, h * 0.34, 20 * scale);
  ctx.fill();
  if (logoImg) {
    const lw = w * 0.22;
    drawLogoCircle(ctx, logoImg, w * 0.5, h * 0.11, lw * 0.45, scale);
  }
  /* Roue avant les textes : sinon elle recouvre l’accroche et le sous-texte. */
  drawWheel(ctx, w * 0.5, h * 0.565, w * 0.36, s.colorPrimary, s.colorSecondary);
  ctx.fillStyle = s.colorPrimary;
  ctx.textAlign = "center";
  ctx.font = `900 italic ${Math.round(w * 0.048)}px "Plus Jakarta Sans", Outfit, sans-serif`;
  wrapCenter(ctx, s.headline, w / 2, h * 0.22, w * 0.82, Math.round(w * 0.052));
  ctx.fillStyle = s.colorAccent;
  ctx.font = `600 ${Math.round(w * 0.028)}px Outfit, sans-serif`;
  ctx.fillText(s.subline, w / 2, h * 0.282);
  const qSize = w * 0.38;
  const qx = w * 0.54;
  const qy = h * 0.625;
  ctx.fillStyle = "#fff";
  roundRect(ctx, qx, qy, qSize, qSize, 14 * scale);
  ctx.fill();
  if (qrImg) ctx.drawImage(qrImg, qx + 10 * scale, qy + 10 * scale, qSize - 20 * scale, qSize - 20 * scale);
  const footerBannerImg = await getFlyerFooterBanner();
  if (footerBannerImg) drawFooterBanner(ctx, w, h, footerBannerImg);
  else drawFooterBar(ctx, w, h, s, true);
}
