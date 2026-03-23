/**
 * Rendu roue du flyer : parts vectorielles (égales) ou image PNG teintée (6 secteurs égaux).
 */
import {
  wheelSegmentColorsResolved,
  FLYER_EXPORT,
  FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG,
  FLYER_WHEEL_PNG_TINT_RADIUS_FACTOR,
} from "./app-flyer-qr-presets.js";

/** Léger chevauchement angulaire pour masquer les fentes anti-alias entre secteurs. */
const SEG_OVERLAP_RAD = 0.005;

function offsetRad(offsetDeg) {
  return ((Number(offsetDeg) || 0) * Math.PI) / 180;
}

/**
 * Parts égales, 1re arête à -π/2 + offset (haut du canvas + rotation).
 * @param {number} i
 * @param {number} n
 * @param {number} offsetDeg
 */
function segmentAnglesEqual(i, n, offsetDeg) {
  const base = -Math.PI / 2 + offsetRad(offsetDeg);
  const step = (Math.PI * 2) / n;
  return {
    t0: base + i * step - SEG_OVERLAP_RAD,
    t1: base + (i + 1) * step + SEG_OVERLAP_RAD,
  };
}

/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r */
function drawWheelHub(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(2, r * 0.02);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {string[]} colors
 * @param {number} [offsetDeg]
 */
export function drawWheelSegments(ctx, cx, cy, r, colors, offsetDeg = 0) {
  const n = colors.length;
  if (n < 1) return;
  for (let i = 0; i < n; i++) {
    const { t0, t1 } = segmentAnglesEqual(i, n, offsetDeg);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, t0, t1);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
  }
  drawWheelHub(ctx, cx, cy, r);
}

/**
 * PNG : clip disque → par secteur : clip part → image → multiply (noir & couleurs vives OK).
 * « color » cassait le noir (L=0) et pouvait laisser déborder hors du disque.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {CanvasImageSource} roueImg
 * @param {string[]} colors
 * @param {number} offsetDeg
 * @param {(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void} drawImageCover
 */
function drawPngWheelSegmentTints(ctx, cx, cy, r, roueImg, colors, offsetDeg, drawImageCover) {
  const n = colors.length;
  if (n < 1) return;
  const box = r * 2;
  const lx = cx - r;
  const ly = cy - r;
  const rt = r * FLYER_WHEEL_PNG_TINT_RADIUS_FACTOR;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rt, 0, Math.PI * 2);
  ctx.clip();

  for (let i = 0; i < n; i++) {
    const { t0, t1 } = segmentAnglesEqual(i, n, offsetDeg);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rt, t0, t1);
    ctx.closePath();
    ctx.clip();
    drawImageCover(ctx, roueImg, lx, ly, box, box);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rt, t0, t1);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }
  ctx.restore();
  drawWheelHub(ctx, cx, cy, r);
}

/** @param {unknown} v @param {string} fb */
function hexOr(v, fb) {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim()) ? v.trim() : fb;
}

/**
 * Anneaux autour du disque (couleur marque + profondeur).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r rayon des parts / image
 * @param {number} scale facteur px export (canvasW / 2400)
 * @param {number} strength 0–10 (0 = rien)
 * @param {string} primaryHex
 * @param {string} darkHex
 */
function drawWheelDecorativeRim(ctx, cx, cy, r, scale, strength, primaryHex, darkHex) {
  const u = Number(strength);
  const str = Number.isFinite(u) ? Math.max(0, Math.min(10, Math.round(u))) : 0;
  if (str <= 0) return;
  const px = Math.max(2, scale * str * 1.08);

  ctx.save();
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10 * scale + px * 0.7;
  ctx.shadowOffsetY = 2.5 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r + px * 0.06, 0, Math.PI * 2);
  ctx.strokeStyle = darkHex;
  ctx.lineWidth = px * 1.02;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, r + px * 0.02, 0, Math.PI * 2);
  ctx.strokeStyle = primaryHex;
  ctx.lineWidth = px * 0.52;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r - px * 0.22, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1, px * 0.26);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {CanvasImageSource | null} roueImg
 * @param {(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void} drawImageCover
 */
export function drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover) {
  const colors = wheelSegmentColorsResolved(s);
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  const usePng = s.wheelRenderMode === "png" && roueImg;
  if (usePng) {
    const off = userOff + FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG;
    drawPngWheelSegmentTints(ctx, wheelCx, wheelCy, wheelR, roueImg, colors, off, drawImageCover);
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
  }

  const cw = ctx.canvas.width || 1;
  const pxScale = cw / FLYER_EXPORT.w;
  drawWheelDecorativeRim(
    ctx,
    wheelCx,
    wheelCy,
    wheelR,
    pxScale,
    s.flyerWheelOutlineWidth,
    hexOr(s.colorPrimary, "#fbbf24"),
    hexOr(s.colorBgBottom, "#020617"),
  );
}
