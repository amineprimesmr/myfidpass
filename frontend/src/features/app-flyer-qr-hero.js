/**
 * Titre principal du flyer QR — rendu canvas premium (dégradé, contour, lueur).
 */

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
 */
export function drawFlyerHeroHeadline(ctx, s, w, h, scale) {
  const text = (s.headline || "").trim();
  if (!text) return;

  const cx = w / 2;
  const cy = h * 0.228;
  const maxW = w * 0.86;
  const fontSize = Math.round(w * 0.058);
  const lineH = Math.round(fontSize * 1.12);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.font = `900 italic ${fontSize}px "Plus Jakarta Sans", "Outfit", ui-sans-serif, system-ui, sans-serif`;

  const lines = wrapTextLines(ctx, text, maxW);
  const totalH = lines.length * lineH;
  const y0 = cy - totalH / 2 + lineH / 2;

  const c1 = s.colorPrimary || "#fbbf24";
  const c2 = s.colorSecondary || "#f97316";

  lines.forEach((line, i) => {
    const ly = y0 + i * lineH;
    const gx0 = cx - maxW * 0.52;
    const gx1 = cx + maxW * 0.52;
    const g = ctx.createLinearGradient(gx0, ly - fontSize * 0.55, gx1, ly + fontSize * 0.55);
    g.addColorStop(0, "#38bdf8");
    g.addColorStop(0.22, c1);
    g.addColorStop(0.48, "#fef9c3");
    g.addColorStop(0.72, c2);
    g.addColorStop(1, c1);

    const off = Math.max(2, scale * 2.5);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#020617";
    ctx.fillText(line, cx + off, ly + off);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(15, 23, 42, 0.94)";
    ctx.lineWidth = Math.max(5, scale * 7);
    ctx.strokeText(line, cx, ly);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = Math.max(1.5, scale * 2);
    ctx.strokeText(line, cx, ly);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(56, 189, 248, 0.7)";
    ctx.shadowBlur = scale * 26;
    ctx.fillStyle = g;
    ctx.fillText(line, cx, ly);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(251, 191, 36, 0.45)";
    ctx.shadowBlur = scale * 14;
    ctx.fillStyle = g;
    ctx.fillText(line, cx, ly);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = g;
    ctx.fillText(line, cx, ly);
    ctx.restore();
  });
}
