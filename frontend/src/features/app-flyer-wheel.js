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
 * @param {string[]} segmentHexColors couleur de chaque part (alignée charte flyer)
 */
function drawWheelSegmentLabels(ctx, cx, cy, r, offsetDeg, n, s, segmentHexColors) {
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
 * PNG : clip disque → par secteur : couleur d'abord, texture PNG en multiply par-dessus.
 * Approche inversée : on pose la teinte commerce, puis le PNG ajoute ombres/reflets metalliques.
 * Fonctionne sur n'importe quelle base PNG (claire ou sombre) — multiply sur fond coloré
 * préserve les ombres (zones noires du PNG restent noires) et les lumières (zones blanches = couleur pure).
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

    // Étape 1 : fond plein couleur commerce
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors[i];
    ctx.fill();

    // Étape 2 : texture PNG par-dessus en multiply — zones sombres = ombres, zones claires = reflets colorés
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1;
    drawImageCover(ctx, roueImg, lx, ly, box, box);

    // Étape 3 : screen léger pour récupérer les reflets métalliques du PNG
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.18;
    drawImageCover(ctx, roueImg, lx, ly, box, box);

    ctx.globalAlpha = 1;
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
 * Libellés GAGNÉ/PERDU (même calage que `drawFlyerWheel`).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./app-flyer-qr-presets.js").FlyerState} s
 */
export function drawFlyerWheelLabelsOverlay(ctx, s, wheelCx, wheelCy, wheelR) {
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  const pngAligned = s.wheelRenderMode !== "segments";
  const labelOff = pngAligned ? userOff + FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG : userOff;
  const cols = wheelSegmentColorsResolved(s);
  drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, labelOff, FLYER_WHEEL_SEGMENT_COUNT, s, cols);
}

export function drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover) {
  const colors = wheelSegmentColorsResolved(s);
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  /** Désactivé : ne pas rebrancher le masque `rouegpt` sans nouvel asset + QA (évite moyeu / rond au centre). */
  const usePng = false;

  drawWheelGroundShadow(ctx, wheelCx, wheelCy, wheelR);

  /** Offset angulaire aligné sur les parts (PNG : même rotation que `drawPngWheelSegmentTints`). */
  const labelOffsetDeg = usePng ? userOff + FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG : userOff;

  if (usePng) {
    const off = labelOffsetDeg;
    drawPngWheelSegmentTints(ctx, wheelCx, wheelCy, wheelR, roueImg, colors, off, drawImageCover);
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
    /** Point central (rayon minuscule) : les 6 arêtes anti-alias laissaient transparaître le fond / halo = « rond blanc ». */
    ctx.save();
    ctx.beginPath();
    ctx.arc(wheelCx, wheelCy, Math.max(1, wheelR * 0.008), 0, Math.PI * 2);
    ctx.fillStyle = colors[0] ?? "#000000";
    ctx.fill();
    ctx.restore();
  }
  /** Libellés canvas (asset `rouegpt` mis à jour : parts vierges, texte géré ici). */
  drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, labelOffsetDeg, FLYER_WHEEL_SEGMENT_COUNT, s, colors);
  /** Ne pas dessiner de moyeu canvas : c’était la « boule » gris-blanc 3D au centre (mode PNG) ; l’image `rouegpt` suffit. */
}
