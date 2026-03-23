/**
 * Rendu roue du flyer : parts colorées (canvas) ou image PNG.
 */
import { wheelSegmentColorsResolved } from "./app-flyer-qr-presets.js";

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
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(2, r * 0.02);
  ctx.stroke();
}

/**
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 * @param {CanvasImageSource | null} roueImg
 * @param {(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void} drawImageCover
 */
export function drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover) {
  const wheelBox = wheelR * 2;
  const usePng = s.wheelRenderMode === "png" && roueImg;
  if (usePng) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(wheelCx, wheelCy, wheelR, 0, Math.PI * 2);
    ctx.clip();
    drawImageCover(ctx, roueImg, wheelCx - wheelBox / 2, wheelCy - wheelBox / 2, wheelBox, wheelBox);
    if (s.wheelImageTintPrimary !== false) {
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = s.colorPrimary;
      ctx.fillRect(wheelCx - wheelBox / 2, wheelCy - wheelBox / 2, wheelBox, wheelBox);
    }
    ctx.restore();
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, wheelSegmentColorsResolved(s));
  }
}
