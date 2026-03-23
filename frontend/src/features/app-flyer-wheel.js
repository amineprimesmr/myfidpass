/**
 * Rendu roue du flyer : parts vectorielles (égales) ou image PNG teintée (6 secteurs égaux).
 */
import {
  wheelSegmentColorsResolved,
  FLYER_WHEEL_SEGMENT_COUNT,
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

/**
 * Libellés le long du rayon de chaque part (axe centre → bord), alternés Gagné / Perdu.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} offsetDeg
 * @param {number} n
 */
function drawWheelSegmentLabels(ctx, cx, cy, r, offsetDeg, n) {
  if (n < 1) return;
  const base = -Math.PI / 2 + offsetRad(offsetDeg);
  const step = (Math.PI * 2) / n;
  /** Milieu radial de la couronne (entre moyeu et bord). */
  const labelR = r * 0.58;
  const fontPx = Math.max(15, Math.round(r * 0.104));
  const track = Math.round(fontPx * 0.04);

  ctx.save();
  ctx.font = `800 ${fontPx}px Outfit, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${track}px`;

  for (let i = 0; i < n; i++) {
    const mid = base + (i + 0.5) * step;
    const tx = cx + Math.cos(mid) * labelR;
    const ty = cy + Math.sin(mid) * labelR;
    const label = i % 2 === 0 ? "Gagné !" : "Perdu !";

    ctx.save();
    ctx.translate(tx, ty);
    /** Axe local X = rayon de la part ; retournement si besoin pour rester lisible. */
    let rot = mid;
    if (Math.sin(mid) > 0) rot += Math.PI;
    ctx.rotate(rot);

    const sw = Math.max(2.5, fontPx * 0.1);
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.round(fontPx * 0.45);
    ctx.shadowOffsetX = Math.round(fontPx * 0.14);
    ctx.shadowOffsetY = Math.round(fontPx * 0.26);
    ctx.fillStyle = "rgba(250,250,250,0.98)";
    ctx.fillText(label, 0, 0);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.lineWidth = sw;
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();
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
  const n = FLYER_WHEEL_SEGMENT_COUNT;
  if (usePng) {
    const off = userOff + FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG;
    drawPngWheelSegmentTints(ctx, wheelCx, wheelCy, wheelR, roueImg, colors, off, drawImageCover);
    drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, off, n);
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
    drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, userOff, n);
  }
  drawWheelHub(ctx, wheelCx, wheelCy, wheelR);
}
