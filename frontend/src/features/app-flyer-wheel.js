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
 * Libellés le long du rayon de chaque part (axe centre → bord), alternés GAGNÉ / PERDU.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} offsetDeg
 * @param {number} n
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
function drawWheelSegmentLabels(ctx, cx, cy, r, offsetDeg, n, s) {
  if (n < 1) return;
  const base = -Math.PI / 2 + offsetRad(offsetDeg);
  const step = (Math.PI * 2) / n;
  /** Milieu radial de la couronne (entre moyeu et bord extérieur) — légèrement resserré pour rester dans le disque. */
  const labelR = r * 0.5;
  const wl = Number(s.flyerWheelLabelScalePct);
  const wsc = Number.isFinite(wl) ? Math.max(0.7, Math.min(1.35, wl / 100)) : 1;
  const fontPx = Math.max(11, Math.round(r * 0.104 * wsc));
  const track = Math.round(fontPx * 0.04);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
  ctx.clip();
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
    const label = i % 2 === 0 ? "GAGNÉ" : "PERDU";

    ctx.save();
    ctx.translate(tx, ty);
    /** Axe local X = rayon de la part ; retournement si besoin pour rester lisible. */
    let rot = mid;
    if (Math.sin(mid) > 0) rot += Math.PI;
    ctx.rotate(rot);

    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.round(fontPx * 0.45);
    ctx.shadowOffsetX = Math.round(fontPx * 0.14);
    ctx.shadowOffsetY = Math.round(fontPx * 0.26);
    ctx.fillStyle = "rgba(252,252,252,0.98)";
    ctx.fillText(label, 0, 0);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();
}

/**
 * Sous-fond vectoriel : sans PNG `rouegpt`, les parts peuvent être très sombres sur fond IA sombre.
 * Disque clair derrière les parts pour garantir la présence visuelle (aperçu app / export).
 */
function drawWheelVectorBacking(ctx, cx, cy, r) {
  ctx.save();
  const rg = ctx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r * 1.02);
  rg.addColorStop(0, "rgba(255,255,255,0.55)");
  rg.addColorStop(0.55, "rgba(255,255,255,0.28)");
  rg.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.restore();
}

/** Ombre portée sous la roue (profondeur, flyer print). */
function drawWheelGroundShadow(ctx, cx, cy, r) {
  ctx.save();
  ctx.globalAlpha = 0.42;
  const gy = cy + r * 0.74;
  const grd = ctx.createRadialGradient(cx, gy, r * 0.08, cx, gy, r * 1.02);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(0.55, "rgba(0,0,0,0.14)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(cx, gy, r * 0.96, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r */
function drawWheelHub(ctx, cx, cy, r) {
  const hr = r * 0.22;
  const g = ctx.createRadialGradient(cx - hr * 0.35, cy - hr * 0.35, hr * 0.05, cx, cy, hr);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.55, "#f4f4f5");
  g.addColorStop(1, "#d4d4d8");
  ctx.beginPath();
  ctx.arc(cx, cy, hr, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = Math.max(2, r * 0.019);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, hr * 0.86, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, r * 0.007);
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
  /** Teintes seules : pas de contour (évite le « cerclage » ; GAGNÉ/PERDU = visuel IA ou asset PNG). */
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
/**
 * Libellés seuls (GAGNÉ / PERDU) par-dessus une roue déjà rendue dans l’image de fond (ex. IA sans typo).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
export function drawFlyerWheelLabelsOverlay(ctx, s, wheelCx, wheelCy, wheelR) {
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, userOff, FLYER_WHEEL_SEGMENT_COUNT, s);
}

export function drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover) {
  const colors = wheelSegmentColorsResolved(s);
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  /** Dès que `roue.png` est chargée : rendu image (trame + teintes). Sinon repli vectoriel minimal. */
  const usePng = Boolean(roueImg);

  drawWheelGroundShadow(ctx, wheelCx, wheelCy, wheelR);
  if (!usePng) drawWheelVectorBacking(ctx, wheelCx, wheelCy, wheelR);

  if (usePng) {
    const off = userOff + FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG;
    drawPngWheelSegmentTints(ctx, wheelCx, wheelCy, wheelR, roueImg, colors, off, drawImageCover);
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
  }
  drawWheelHub(ctx, wheelCx, wheelCy, wheelR);
}
