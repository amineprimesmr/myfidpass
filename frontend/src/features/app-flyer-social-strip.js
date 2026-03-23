/**
 * Bande réseaux sociaux sous le bandeau du flyer QR (icônes + canvas).
 */
import { FLYER_LAYOUT } from "./app-flyer-qr-presets.js";

/** @type {Record<string, string>} */
const ICON_PNG = {
  instagram: "/assets/logos/instagram.png",
  facebook: "/assets/logos/facebook.png",
  tiktok: "/assets/logos/tiktok.png",
  linkedin: "/assets/logos/linkedin.png",
  snapchat: "/assets/logos/snapchat.png",
  tripadvisor: "/assets/logos/tripadvisor.png",
  google: "/assets/logos/google.png",
};

const ALLOWED = new Set(Object.keys(ICON_PNG).concat(["youtube", "twitter"]));

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

/** @type {Map<string, HTMLImageElement | null>} */
const pngCache = new Map();

/**
 * @param {string} platform
 * @returns {Promise<HTMLImageElement | null>}
 */
async function getPngIcon(platform) {
  const path = ICON_PNG[platform];
  if (!path) return null;
  if (pngCache.has(platform)) return pngCache.get(platform) ?? null;
  try {
    const img = await loadImage(path, false);
    pngCache.set(platform, img);
    return img;
  } catch {
    pngCache.set(platform, null);
    return null;
  }
}

/** @param {string} raw */
function normalizeUrl(raw) {
  let t = String(raw).trim();
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) t = `https://${t.replace(/^\/+/, "")}`;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

/**
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @returns {{ platform: string; url: string }[]}
 */
export function parseFlyerSocialEntries(s) {
  const rows = [
    [s.social1, s.socialUrl1],
    [s.social2, s.socialUrl2],
    [s.social3, s.socialUrl3],
  ];
  const out = [];
  for (const [pid, urlRaw] of rows) {
    const p = typeof pid === "string" ? pid.trim().toLowerCase() : "";
    const u = normalizeUrl(typeof urlRaw === "string" ? urlRaw : "");
    if (!p || !u || !ALLOWED.has(p)) continue;
    out.push({ platform: p, url: u });
    if (out.length >= 3) break;
  }
  return out;
}

/** @param {number} canvasH @param {number} count */
export function flyerSocialStripHeight(canvasH, count) {
  return count > 0 ? Math.round(canvasH * FLYER_LAYOUT.socialStripHeightFrac) : 0;
}

/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r */
function drawYoutubeGlyph(ctx, cx, cy, r) {
  const s = r * 1.45;
  const x = cx - s / 2;
  const y = cy - s * 0.38;
  const rw = s;
  const rh = s * 0.76;
  const rr = s * 0.2;
  ctx.fillStyle = "#ff0033";
  roundRectPath(ctx, x, y, rw, rh, rr);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  const px = cx + s * 0.05;
  ctx.moveTo(px - s * 0.2, cy - s * 0.12);
  ctx.lineTo(px + s * 0.14, cy);
  ctx.lineTo(px - s * 0.2, cy + s * 0.12);
  ctx.closePath();
  ctx.fill();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} rad */
function roundRectPath(ctx, x, y, w, h, rad) {
  const rr = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r */
function drawTwitterXGlyph(ctx, cx, cy, r) {
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.5, r * 0.38);
  const d = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.moveTo(cx + d, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} yTop
 * @param {number} stripH
 * @param {{ platform: string; url: string }[]} entries
 * @param {import("./app-flyer-qr-presets.js").FlyerState} [flyerState]
 */
export async function drawFlyerSocialStrip(ctx, w, yTop, stripH, entries, flyerState) {
  if (!entries.length) return;
  const ft = flyerState ? Number(flyerState.flyerFooterTextScalePct) : NaN;
  const fsc = Number.isFinite(ft) ? Math.max(0.7, Math.min(1.35, ft / 100)) : 1;
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, yTop, w, stripH);
  const n = entries.length;
  const iconR = stripH * 0.28 * fsc;
  const gap = w * 0.055;
  const total = n * iconR * 2 + (n - 1) * gap;
  let x = (w - total) / 2 + iconR;
  const cy = yTop + stripH * 0.58;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = `700 ${Math.round(stripH * 0.19 * fsc)}px Outfit, system-ui, sans-serif`;
  ctx.fillText("Suivez-nous", w / 2, yTop + stripH * 0.24);

  for (const e of entries) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, cy, iconR, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (e.platform === "youtube") {
      drawYoutubeGlyph(ctx, x, cy, iconR * 0.65);
    } else if (e.platform === "twitter") {
      drawTwitterXGlyph(ctx, x, cy, iconR * 0.52);
    } else {
      const img = await getPngIcon(e.platform);
      if (img && img.naturalWidth) {
        const pad = iconR * 0.58;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, cy, pad, 0, Math.PI * 2);
        ctx.clip();
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const sc = Math.min((pad * 2) / iw, (pad * 2) / ih);
        const dw = iw * sc;
        const dh = ih * sc;
        ctx.drawImage(img, x - dw / 2, cy - dh / 2, dw, dh);
        ctx.restore();
      }
    }
    ctx.restore();
    x += iconR * 2 + gap;
  }
}
