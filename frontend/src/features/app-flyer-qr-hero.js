/**
 * Titre principal du flyer QR — rendu sobre (couleurs & police pilotées par l’utilisateur).
 */
import { flyerHeadlineFontDef } from "./app-flyer-qr-headline-fonts.js";
import { FLYER_LOGO_BLOCK_BOTTOM_FRAC } from "./app-flyer-qr-presets.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxW
 * @returns {string[]}
 */
function wrapTextLines(ctx, text, maxW) {
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
 */
export function drawFlyerHeroHeadline(ctx, s, w, h, scale, hasLogo) {
  const text = (s.headline || "").trim();
  if (!text) return;

  const font = flyerHeadlineFontDef(s.headlineFontId);
  const fontSize = Math.round(w * 0.052);
  const lineH = Math.round(fontSize * (font.id === "bebas" ? 1.05 : 1.18));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.font = `${font.style === "italic" ? "italic " : ""}${font.weight} ${fontSize}px ${font.stack}`;

  const maxW = w * 0.88;
  const lines = wrapTextLines(ctx, text, maxW);

  const gapFrac = Math.min(14, Math.max(0, Number(s.headlineLogoGapPct) || 0)) / 100;
  const logoBottomFrac = hasLogo ? FLYER_LOGO_BLOCK_BOTTOM_FRAC : 0.052;
  const blockTop = h * logoBottomFrac + h * gapFrac;
  const firstLineCy = blockTop + lineH * 0.5;

  const fill = s.headlineTextColor || "#ffffff";
  const strokeC = s.headlineStrokeColor || "#020617";
  const strokeW = Math.min(14, Math.max(0, Number(s.headlineStrokeWidth) || 0));
  const strokePx = strokeW > 0 ? Math.max(1, scale * strokeW * 0.85) : 0;

  const trackRaw = Number(s.headlineLetterSpacing);
  const trackPx = Number.isFinite(trackRaw)
    ? Math.round(Math.min(8, Math.max(0, trackRaw)) * scale)
    : 0;
  const canTrack = trackPx > 0 && "letterSpacing" in ctx;
  if (canTrack) ctx.letterSpacing = `${trackPx}px`;

  lines.forEach((line, i) => {
    const ly = firstLineCy + i * lineH;
    if (strokePx > 0) {
      ctx.strokeStyle = strokeC;
      ctx.lineWidth = strokePx;
      ctx.strokeText(line, w / 2, ly);
    }
    ctx.fillStyle = fill;
    ctx.fillText(line, w / 2, ly);
  });

  if (canTrack) ctx.letterSpacing = "0px";
}
