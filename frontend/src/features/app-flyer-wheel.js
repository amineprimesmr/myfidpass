/**
 * Rendu roue du flyer : mode vectoriel unique (segments propres).
 */
import { wheelSegmentColorsResolved, FLYER_WHEEL_SEGMENT_COUNT } from "./app-flyer-qr-presets.js";

/** Léger chevauchement angulaire pour masquer les fentes anti-alias entre secteurs. */
const SEG_OVERLAP_RAD = 0.003;

/**
 * Rayon extérieur des teintes / parts, relatif au rayon logique `wheelR`.
 * Plus haut = couleurs plus près du bord visuel de la texture ; trop haut = risque sur le jante métal.
 */
const WHEEL_COLOR_OUTER_R_FRAC = 1;

/**
 * Rayon intérieur des parts (0 = secteurs pleins jusqu’au centre, **pas** de « trou » sans teinte).
 */
const WHEEL_HUB_R_FRAC = 0;

/**
 * Cercle de **clip** pour les libellés — suit un peu l’anneau élargi pour ne pas rogner les textes.
 */
const WHEEL_LABEL_CLIP_R_FRAC = 0.82;
const CLEAN_ODD = "#fbbf24";
const CLEAN_EVEN = "#f59e0b";
/** Petit recalage global des parts couleur sur la texture gameflyer. */
const WHEEL_MASK_ALIGNMENT_OFFSET_DEG = -30;
const WHEEL_EVEN_VERY_LIGHT = "#f8fafc";

/**
 * @param {string} hex
 * @returns {{ r: number; g: number; b: number }}
 */
function hexToRgb(hex) {
  const h = String(hex || "").replace(/^#/, "");
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Luminance relative 0–1. */
function lumaFromHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Évite les couleurs trop claires/sales dans la roue (ex: blanc pur).
 * @param {string[]} colors
 * @returns {string[]}
 */
function normalizeWheelColors(colors) {
  return colors.map((hex, i) => {
    if (i % 2 === 1) return WHEEL_EVEN_VERY_LIGHT;
    const lum = lumaFromHex(hex);
    if (lum > 0.9) return CLEAN_ODD;
    return hex || CLEAN_ODD;
  });
}

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
  const base = -Math.PI / 2 + offsetRad(offsetDeg + WHEEL_MASK_ALIGNMENT_OFFSET_DEG);
  const step = (Math.PI * 2) / n;
  return {
    t0: base + i * step - SEG_OVERLAP_RAD,
    t1: base + (i + 1) * step + SEG_OVERLAP_RAD,
  };
}

/**
 * Secteur de couronne (donut) : entre rInner et rOuter.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} t0
 * @param {number} t1
 */
function pathAnnulusSector(ctx, cx, cy, rInner, rOuter, t0, t1) {
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(t0) * rOuter, cy + Math.sin(t0) * rOuter);
  ctx.arc(cx, cy, rOuter, t0, t1, false);
  ctx.lineTo(cx + Math.cos(t1) * rInner, cy + Math.sin(t1) * rInner);
  ctx.arc(cx, cy, rInner, t1, t0, true);
  ctx.closePath();
}

/** Secteur coloré : part pleine (centre → bord) si `rInner` ≈ 0, sinon couronne. */
function pathWheelSector(ctx, cx, cy, rInner, rOuter, t0, t1) {
  if (rInner <= 0.5) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOuter, t0, t1, false);
    ctx.closePath();
  } else {
    pathAnnulusSector(ctx, cx, cy, rInner, rOuter, t0, t1);
  }
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
 * @param {string[]} segmentHexColors couleur de chaque part (alignée charte flyer)
 */
function drawWheelSegmentLabels(ctx, cx, cy, r, offsetDeg, n, s, segmentHexColors) {
  if (n < 1) return;
  const base = -Math.PI / 2 + offsetRad(offsetDeg + WHEEL_MASK_ALIGNMENT_OFFSET_DEG);
  const step = (Math.PI * 2) / n;
  /** Milieu radial de la couronne (entre moyeu et bord extérieur) — légèrement resserré pour rester dans le disque. */
  const labelR = r * 0.5;
  const wl = Number(s.flyerWheelLabelScalePct);
  const wsc = Number.isFinite(wl) ? Math.max(0.7, Math.min(1.35, wl / 100)) : 1;
  const fontPx = Math.max(11, Math.round(r * 0.104 * wsc));
  const track = Math.round(fontPx * 0.04);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * WHEEL_LABEL_CLIP_R_FRAC, 0, Math.PI * 2);
  ctx.clip();
  ctx.font = `800 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.miterLimit = 2;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${track}px`;

  for (let i = 0; i < n; i++) {
    const mid = base + (i + 0.5) * step;
    const tx = cx + Math.cos(mid) * labelR;
    const ty = cy + Math.sin(mid) * labelR;
    const label = i % 2 === 0 ? "GAGNÉ !" : "PERDU !";
    const segHex = segmentHexColors[i] ?? "#ffffff";
    /** Texte canvas par-dessus les parts teintées (PNG vierge ou vectoriel). */
    const lum = lumaFromHex(segHex);
    const fillCore = lum > 0.62 ? "#0f172a" : "#ffffff";

    ctx.save();
    ctx.translate(tx, ty);
    /** Axe local X = rayon de la part ; retournement si besoin pour rester lisible. */
    let rot = mid;
    if (Math.sin(mid) > 0) rot += Math.PI;
    ctx.rotate(rot);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = fillCore;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();
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
  const rOut = r * WHEEL_COLOR_OUTER_R_FRAC;
  const rIn = r * WHEEL_HUB_R_FRAC;
  for (let i = 0; i < n; i++) {
    const { t0, t1 } = segmentAnglesEqual(i, n, offsetDeg);
    pathWheelSector(ctx, cx, cy, rIn, rOut, t0, t1);
    ctx.fillStyle = colors[i];
    ctx.fill();
  }
}

/**
 * Libellés GAGNÉ/PERDU (même calage que `drawFlyerWheel`).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
export function drawFlyerWheelLabelsOverlay(ctx, s, wheelCx, wheelCy, wheelR) {
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  const cols = normalizeWheelColors(wheelSegmentColorsResolved(s));
  drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, userOff, FLYER_WHEEL_SEGMENT_COUNT, s, cols);
}

export function drawFlyerWheel(ctx, s, wheelCx, wheelCy, wheelR) {
  const colors = normalizeWheelColors(wheelSegmentColorsResolved(s));
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
  drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, userOff, FLYER_WHEEL_SEGMENT_COUNT, s, colors);
}
