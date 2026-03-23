/**
 * Rendu roue du flyer : parts vectorielles ou image PNG teintée part par part.
 */
import { wheelSegmentColorsResolved } from "./app-flyer-qr-presets.js";

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
 */
export function drawWheelSegments(ctx, cx, cy, r, colors) {
  const n = colors.length;
  if (n < 1) return;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const t1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
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
 * PNG : une part = clip secteur → image complète → fusion « color » (conserve le volume).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {CanvasImageSource} roueImg
 * @param {string[]} colors
 * @param {(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void} drawImageCover
 */
function drawPngWheelSegmentTints(ctx, cx, cy, r, roueImg, colors, drawImageCover) {
  const n = colors.length;
  if (n < 1) return;
  const box = r * 2;
  const lx = cx - r;
  const ly = cy - r;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const t1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
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
  const usePng = s.wheelRenderMode === "png" && roueImg;
  if (usePng) {
    drawPngWheelSegmentTints(ctx, wheelCx, wheelCy, wheelR, roueImg, colors, drawImageCover);
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors);
  }
}
