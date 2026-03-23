/**
 * Cadre décoratif autour du carré QR (ombre + double trait couleur marque).
 */

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} rw @param {number} rh @param {number} r */
function roundRectPath(ctx, x, y, rw, rh, r) {
  const rr = Math.min(r, rw / 2, rh / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + rw, y, x + rw, y + rh, rr);
  ctx.arcTo(x + rw, y + rh, x, y + rh, rr);
  ctx.arcTo(x, y + rh, x, y, rr);
  ctx.arcTo(x, y, x + rw, y, rr);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} qx
 * @param {number} qy
 * @param {number} qSize
 * @param {number} cornerR
 * @param {number} scale
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
export function drawFlyerQrCardOutline(ctx, qx, qy, qSize, cornerR, scale, s) {
  const raw = Number(s.flyerQrOutlineWidth);
  const strength = Number.isFinite(raw) ? Math.max(0, Math.min(12, Math.round(raw))) : 0;
  if (strength <= 0) return;

  const px = Math.max(2, scale * strength * 1.05);
  const prim = /^#[0-9A-Fa-f]{6}$/.test(String(s.colorPrimary || "").trim())
    ? String(s.colorPrimary).trim()
    : "#fbbf24";
  const dark = /^#[0-9A-Fa-f]{6}$/.test(String(s.colorBgBottom || "").trim())
    ? String(s.colorBgBottom).trim()
    : "#020617";

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 11 * scale + px * 0.85;
  ctx.shadowOffsetY = 3 * scale;
  roundRectPath(ctx, qx, qy, qSize, qSize, cornerR);
  ctx.strokeStyle = dark;
  ctx.lineWidth = px * 1.05;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  roundRectPath(ctx, qx, qy, qSize, qSize, cornerR);
  ctx.strokeStyle = prim;
  ctx.lineWidth = px * 0.58;
  ctx.stroke();

  const inset = px * 0.14;
  roundRectPath(
    ctx,
    qx + inset,
    qy + inset,
    qSize - 2 * inset,
    qSize - 2 * inset,
    Math.max(4, cornerR - inset * 0.5),
  );
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = Math.max(1, px * 0.22);
  ctx.stroke();
  ctx.restore();
}
