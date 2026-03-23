/**
 * Rendu canvas des flyers QR (export PNG & aperçu).
 */
import { FLYER_EXPORT } from "./app-flyer-qr-presets.js";

export { FLYER_EXPORT };

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
    im.onload = () => resolve(im);
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
 * @param {string | null} logoUrl
 */
export async function renderFlyerCanvas(canvas, s, qrTargetUrl, logoUrl) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  const scale = w / FLYER_EXPORT.w;
  const qrPx = Math.round(420 * scale);

  const qrImg = await loadQrAsImage(qrTargetUrl, Math.min(800, Math.round(qrPx * 2)));

  let logoImg = null;
  if (logoUrl) {
    try {
      logoImg = await loadImage(logoUrl, true);
    } catch (_) {
      try {
        logoImg = await loadImage(logoUrl, false);
      } catch (_) {}
    }
  }

  const tpl = s.templateId;

  if (tpl === "studio-clean") {
    fillGradientV(ctx, w, h, s.colorBgTop, s.colorBgBottom);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, w * 0.06, h * 0.04, w * 0.88, h * 0.22, w * 0.02);
    ctx.fill();
    ctx.fillStyle = s.colorAccent;
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.round(w * 0.065)}px "Plus Jakarta Sans", Outfit, sans-serif`;
    wrapCenter(ctx, s.headline, w / 2, h * 0.11, w * 0.75, Math.round(w * 0.055));
    ctx.fillStyle = "#64748b";
    ctx.font = `600 ${Math.round(w * 0.032)}px Outfit, sans-serif`;
    ctx.fillText(s.subline, w / 2, h * 0.2);
    const qx = w * 0.22;
    const qy = h * 0.32;
    const qw = w * 0.56;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qx - 16 * scale, qy - 16 * scale, qw + 32 * scale, qw + 32 * scale, 20 * scale);
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 3 * scale;
    roundRect(ctx, qx - 16 * scale, qy - 16 * scale, qw + 32 * scale, qw + 32 * scale, 20 * scale);
    ctx.stroke();
    if (qrImg) ctx.drawImage(qrImg, qx, qy, qw, qw);
    else {
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(qx, qy, qw, qw);
    }
    ctx.fillStyle = s.colorPrimary;
    roundRect(ctx, w * 0.15, h * 0.78, w * 0.7, h * 0.08, w * 0.02);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(w * 0.038)}px Outfit, sans-serif`;
    ctx.fillText(s.ctaBanner, w / 2, h * 0.82);
    drawFooterBar(ctx, w, h, s, false);
  } else if (tpl === "sunset-roue") {
    fillGradientV(ctx, w, h, s.colorBgTop, s.colorBgBottom);
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#fff" : "#fbcfe8";
      ctx.beginPath();
      ctx.arc(w * (0.1 + i * 0.12), h * 0.15, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const wr = w * 0.38;
    drawWheel(ctx, w * 0.48, h * 0.42, wr, s.colorPrimary, s.colorSecondary);
    ctx.fillStyle = s.colorAccent;
    ctx.textAlign = "center";
    ctx.font = `900 ${Math.round(w * 0.055)}px "Plus Jakarta Sans", Outfit, sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 4 * scale;
    ctx.strokeText(s.headline, w / 2, h * 0.1);
    ctx.fillText(s.headline, w / 2, h * 0.1);
    ctx.font = `600 ${Math.round(w * 0.028)}px Outfit, sans-serif`;
    ctx.fillText(s.subline, w / 2, h * 0.15);
    if (logoImg) {
      const lw = w * 0.2;
      ctx.save();
      roundRect(ctx, w / 2 - lw / 2, h * 0.02, lw, lw * 0.55, 12 * scale);
      ctx.clip();
      ctx.drawImage(logoImg, w / 2 - lw / 2, h * 0.02, lw, lw * 0.55);
      ctx.restore();
    }
    const qSize = w * 0.42;
    const qx = w * 0.52;
    const qy = h * 0.52;
    ctx.fillStyle = "#fff";
    roundRect(ctx, qx, qy, qSize, qSize, 18 * scale);
    ctx.fill();
    if (qrImg) ctx.drawImage(qrImg, qx + 12 * scale, qy + 12 * scale, qSize - 24 * scale, qSize - 24 * scale);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    roundRect(ctx, w * 0.05, h * 0.58, w * 0.42, h * 0.08, 10 * scale);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(w * 0.032)}px Outfit, sans-serif`;
    ctx.fillText(s.ctaBanner, w * 0.26, h * 0.62);
    drawFooterBar(ctx, w, h, s, true);
  } else if (tpl === "foret-jeu") {
    fillGradientV(ctx, w, h, s.colorBgTop, s.colorBgBottom);
    ctx.fillStyle = "#fff";
    roundRect(ctx, w * 0.08, h * 0.05, w * 0.35, h * 0.08, 8 * scale);
    ctx.fill();
    ctx.fillStyle = s.colorPrimary;
    ctx.font = `900 ${Math.round(w * 0.045)}px "Plus Jakarta Sans", Outfit, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(s.headline.split(" ")[0] || "JEU", w * 0.255, h * 0.092);
    ctx.fillStyle = "#fff";
    roundRect(ctx, w * 0.08, h * 0.14, w * 0.84, h * 0.1, 8 * scale);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = `900 ${Math.round(w * 0.038)}px "Plus Jakarta Sans", Outfit, sans-serif`;
    wrapCenter(ctx, s.headline, w * 0.5, h * 0.19, w * 0.75, Math.round(w * 0.04));
    drawWheel(ctx, w * 0.5, h * 0.45, w * 0.32, "#0f172a", "#ffffff");
    const qSize = w * 0.4;
    const qx = w * 0.52;
    const qy = h * 0.52;
    ctx.fillStyle = "#fff";
    roundRect(ctx, qx, qy, qSize, qSize, 16 * scale);
    ctx.fill();
    ctx.strokeStyle = s.colorSecondary;
    ctx.lineWidth = 5 * scale;
    roundRect(ctx, qx, qy, qSize, qSize, 16 * scale);
    ctx.stroke();
    if (qrImg) ctx.drawImage(qrImg, qx + 14 * scale, qy + 14 * scale, qSize - 28 * scale, qSize - 28 * scale);
    ctx.save();
    ctx.translate(w * 0.12, h * 0.62);
    ctx.rotate(-0.08);
    ctx.fillStyle = "#0f172a";
    roundRect(ctx, 0, 0, w * 0.45, h * 0.07, 6 * scale);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(w * 0.03)}px Outfit, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(s.ctaBanner, w * 0.225, h * 0.655);
    ctx.restore();
    if (logoImg) {
      const lw = w * 0.22;
      ctx.drawImage(logoImg, w / 2 - lw / 2, h * 0.025, lw, lw * 0.5);
    }
    drawFooterBar(ctx, w, h, s, true);
  } else {
    /* noir-or-roue */
    fillGradientV(ctx, w, h, s.colorBgTop, s.colorBgBottom);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, w * 0.04, h * 0.03, w * 0.92, h * 0.34, 20 * scale);
    ctx.fill();
    if (logoImg) {
      const lw = w * 0.22;
      ctx.save();
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.11, lw * 0.45, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, w * 0.5 - lw * 0.45, h * 0.11 - lw * 0.45, lw * 0.9, lw * 0.9);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.11, lw * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = s.colorPrimary;
    ctx.textAlign = "center";
    ctx.font = `900 italic ${Math.round(w * 0.048)}px "Plus Jakarta Sans", Outfit, sans-serif`;
    wrapCenter(ctx, s.headline, w / 2, h * 0.22, w * 0.82, Math.round(w * 0.052));
    ctx.fillStyle = s.colorAccent;
    ctx.font = `600 ${Math.round(w * 0.028)}px Outfit, sans-serif`;
    ctx.fillText(s.subline, w / 2, h * 0.3);
    drawWheel(ctx, w * 0.5, h * 0.52, w * 0.36, s.colorPrimary, s.colorSecondary);
    const qSize = w * 0.38;
    const qx = w * 0.54;
    const qy = h * 0.58;
    ctx.fillStyle = "#fff";
    roundRect(ctx, qx, qy, qSize, qSize, 14 * scale);
    ctx.fill();
    if (qrImg) ctx.drawImage(qrImg, qx + 10 * scale, qy + 10 * scale, qSize - 20 * scale, qSize - 20 * scale);
    drawFooterBar(ctx, w, h, s, true);
  }

  if (s.showLegalMention) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `500 ${Math.round(w * 0.022)}px Outfit, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("Ne pas jeter sur la voie publique", w - w * 0.03, h - h * 0.018);
  }
}
