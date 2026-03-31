/**
 * Titre principal du flyer QR — rendu sobre (couleurs & police pilotées par l’utilisateur).
 */
import { FLYER_LOGO_BLOCK_BOTTOM_FRAC } from "./app-flyer-qr-presets.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxW
 * @returns {string[]}
 */
export function wrapCanvasTextLines(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {number} w
 * @param {number} h
 * @param {number} scale
 * @param {boolean} hasLogo
 * @returns {number} bord bas approximatif du bloc titre (px), ou 0 si pas de texte
 */
export function drawFlyerHeroHeadline(ctx, s, w, h, scale, hasLogo) {
  const text = (s.headline || "").trim();
  if (!text) return 0;

  const sizePct = Number(s.headlineSizePct);
  const frac = (Number.isFinite(sizePct) ? Math.max(5, Math.min(18, sizePct)) : 9.2) / 100;
  const fontSize = Math.round(w * frac * 1.1);
  const lineH = Math.round(fontSize * 1.02);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.font = `900 ${fontSize}px Outfit, "Arial Black", system-ui, sans-serif`;

  const maxW = w * 0.92;
  const lines = wrapCanvasTextLines(ctx, text.toUpperCase(), maxW).slice(0, 3);

  const gapFrac = Math.min(14, Math.max(0, Number(s.headlineLogoGapPct) || 0)) / 100;
  const logoBottomFrac = hasLogo ? FLYER_LOGO_BLOCK_BOTTOM_FRAC : 0.052;
  const blockTop = h * logoBottomFrac + h * gapFrac;
  const firstLineCy = blockTop + lineH * 0.5;

  const fill = "#FFFFFF";
  const strokeC = "#0B1020";
  const strokePx = Math.max(1.7, scale * 7.5);

  const trackRaw = Number(s.headlineLetterSpacing);
  const trackPx = Number.isFinite(trackRaw)
    ? Math.round(Math.min(8, Math.max(0, trackRaw)) * scale)
    : 0;
  const canTrack = trackPx > 0 && "letterSpacing" in ctx;
  if (canTrack) ctx.letterSpacing = `${trackPx}px`;

  lines.forEach((line, i) => {
    const ly = firstLineCy + i * lineH;
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.lineWidth = strokePx * 1.9;
    ctx.strokeText(line, w / 2, ly);
    ctx.strokeStyle = strokeC;
    ctx.lineWidth = strokePx * 1.15;
    ctx.strokeText(line, w / 2, ly);
    ctx.fillStyle = fill;
    ctx.fillText(line, w / 2, ly);

    const m = /CADEAU!?/.exec(line);
    if (m) {
      const token = m[0];
      const idx = m.index || 0;
      const before = line.slice(0, idx);
      const totalW = ctx.measureText(line).width;
      const startX = w / 2 - totalW / 2;
      const beforeW = ctx.measureText(before).width;
      const tokenW = ctx.measureText(token).width;
      const tx = startX + beforeW + tokenW / 2;
      ctx.save();
      ctx.translate(tx, ly);
      ctx.rotate((-8 * Math.PI) / 180);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = strokePx * 1.15;
      ctx.strokeText(token, 0, 0);
      ctx.fillStyle = "#ff4f78";
      ctx.fillText(token, 0, 0);
      ctx.restore();
    }
  });

  if (canTrack) ctx.letterSpacing = "0px";

  const lastCy = firstLineCy + (lines.length - 1) * lineH;
  return lastCy + lineH * 0.55;
}
