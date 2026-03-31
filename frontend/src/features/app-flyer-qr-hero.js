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
  const frac = (Number.isFinite(sizePct) ? Math.max(5, Math.min(18, sizePct)) : 8) / 100;
  const fontSize = Math.round(w * frac * 1.1);
  const lineH = Math.round(fontSize * 1.02);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.font = `900 ${fontSize}px Outfit, "Arial Black", system-ui, sans-serif`;

  const maxW = w * 0.92;
  const lines = wrapCanvasTextLines(ctx, text.toUpperCase(), maxW).slice(0, 3);

  const gapFrac = Math.min(22, Math.max(0, Number(s.headlineLogoGapPct) || 0)) / 100;
  const logoBottomFrac = hasLogo ? FLYER_LOGO_BLOCK_BOTTOM_FRAC : 0.052;
  const blockTop = h * logoBottomFrac + h * gapFrac;
  const firstLineCy = blockTop + lineH * 0.5;

  const fill = /^#[0-9A-Fa-f]{6}$/.test(String(s.headlineTextColor || "").trim())
    ? String(s.headlineTextColor).trim()
    : "#FFFFFF";
  const strokeC = /^#[0-9A-Fa-f]{6}$/.test(String(s.headlineStrokeColor || "").trim())
    ? String(s.headlineStrokeColor).trim()
    : "#0B1020";
  const strokeW = Number.isFinite(Number(s.headlineStrokeWidth))
    ? Math.max(0, Math.min(48, Number(s.headlineStrokeWidth)))
    : 8;
  const strokePx = Math.max(1.2, scale * strokeW);

  const trackRaw = Number(s.headlineLetterSpacing);
  const trackPx = Number.isFinite(trackRaw)
    ? Math.round(Math.min(8, Math.max(0, trackRaw)) * scale)
    : 0;
  const canTrack = trackPx > 0 && "letterSpacing" in ctx;
  if (canTrack) ctx.letterSpacing = `${trackPx}px`;

  /**
   * Dessine une ligne en évitant toute superposition du mot CADEAU/CADEAU!.
   * @param {string} line
   * @param {number} ly
   */
  const drawHeadlineLine = (line, ly) => {
    const m = /CADEAU!?/.exec(line);
    if (!m) {
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = strokePx * 1.9;
      ctx.strokeText(line, w / 2, ly);
      ctx.strokeStyle = strokeC;
      ctx.lineWidth = strokePx * 1.15;
      ctx.strokeText(line, w / 2, ly);
      ctx.fillStyle = fill;
      ctx.fillText(line, w / 2, ly);
      return;
    }

    const token = m[0];
    const idx = m.index || 0;
    const before = line.slice(0, idx);
    const after = line.slice(idx + token.length);
    const totalW = ctx.measureText(line).width;
    const startX = w / 2 - totalW / 2;
    const beforeW = ctx.measureText(before).width;
    const tokenW = ctx.measureText(token).width;
    const afterW = ctx.measureText(after).width;

    const drawPart = (txt, cx, fillColor, tiltDeg = 0) => {
      ctx.save();
      ctx.translate(cx, ly);
      if (tiltDeg) ctx.rotate((tiltDeg * Math.PI) / 180);
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = strokePx * 1.9;
      ctx.strokeText(txt, 0, 0);
      ctx.strokeStyle = strokeC;
      ctx.lineWidth = strokePx * 1.15;
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = fillColor;
      ctx.fillText(txt, 0, 0);
      ctx.restore();
    };

    if (before) {
      const beforeCx = startX + beforeW / 2;
      drawPart(before, beforeCx, fill, 0);
    }

    const hasBang = token.endsWith("!");
    const giftToken = hasBang ? "CADEAU" : token;
    const giftW = ctx.measureText(giftToken).width;
    const giftCx = startX + beforeW + giftW / 2;
    drawPart(giftToken, giftCx, "#ff4f78", -8);

    if (hasBang) {
      const bangW = ctx.measureText("!").width;
      const bangCx = startX + beforeW + giftW + bangW / 2;
      drawPart("!", bangCx, "#ff4f78", -8);
    }

    if (after) {
      const afterCx = startX + beforeW + tokenW + afterW / 2;
      drawPart(after, afterCx, fill, 0);
    }
  };

  lines.forEach((line, i) => {
    const ly = firstLineCy + i * lineH;
    drawHeadlineLine(line, ly);
  });

  if (canTrack) ctx.letterSpacing = "0px";

  const lastCy = firstLineCy + (lines.length - 1) * lineH;
  return lastCy + lineH * 0.55;
}
