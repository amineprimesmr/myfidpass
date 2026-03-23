/**
 * Rendu roue du flyer : parts vectorielles (égales) ou image PNG teintée (géométrie du fichier roue.png).
 */
import {
  wheelSegmentColorsResolved,
  FLYER_WHEEL_PNG_ARC_FRACTIONS,
  FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG,
} from "./app-flyer-qr-presets.js";

/** Léger chevauchement angulaire pour masquer les fentes anti-alias entre secteurs. */
const SEG_OVERLAP_RAD = 0.007;

function offsetRad(offsetDeg) {
  return ((Number(offsetDeg) || 0) * Math.PI) / 180;
}

/**
 * Parts égales (mode vectoriel), 1re part commence au « haut » canvas (-π/2) + offset.
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
 * Parts selon fractions du PNG (sens horaire depuis la 1re rainure calée par offset).
 * @param {number} i
 * @param {number} offsetDeg
 * @param {readonly number[]} fractions
 */
function segmentAnglesPng(i, offsetDeg, fractions) {
  const base = -Math.PI / 2 + offsetRad(offsetDeg);
  const twoPi = Math.PI * 2;
  let acc = 0;
  for (let j = 0; j < i; j++) acc += fractions[j] * twoPi;
  const span = fractions[i] * twoPi;
  return {
    t0: base + acc - SEG_OVERLAP_RAD,
    t1: base + acc + span + SEG_OVERLAP_RAD,
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
 * PNG : clip secteur → image → fusion « color ».
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {CanvasImageSource} roueImg
 * @param {string[]} colors
 * @param {number} offsetDeg
 * @param {readonly number[]} fractions
 * @param {(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void} drawImageCover
 */
function drawPngWheelSegmentTints(ctx, cx, cy, r, roueImg, colors, offsetDeg, fractions, drawImageCover) {
  const n = colors.length;
  if (n < 1 || fractions.length !== n) return;
  const box = r * 2;
  const lx = cx - r;
  const ly = cy - r;
  for (let i = 0; i < n; i++) {
    const { t0, t1 } = segmentAnglesPng(i, offsetDeg, fractions);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, t0, t1);
    ctx.closePath();
    ctx.clip();
    drawImageCover(ctx, roueImg, lx, ly, box, box);
    ctx.globalCompositeOperation = "color";
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, t0, t1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  drawWheelHub(ctx, cx, cy, r);
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
    drawPngWheelSegmentTints(
      ctx,
      wheelCx,
      wheelCy,
      wheelR,
      roueImg,
      colors,
      off,
      FLYER_WHEEL_PNG_ARC_FRACTIONS,
      drawImageCover,
    );
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
  }
}
