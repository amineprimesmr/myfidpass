/**
 * Rendu roue du flyer : parts vectorielles (égales) ou image PNG teintée (6 secteurs égaux).
 */
import {
  wheelSegmentColorsResolved,
  FLYER_WHEEL_SEGMENT_COUNT,
  FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG,
} from "./app-flyer-qr-presets.js";

/** Léger chevauchement angulaire pour masquer les fentes anti-alias entre secteurs. */
const SEG_OVERLAP_RAD = 0.005;

/**
 * Rayon extérieur des teintes / parts, relatif au rayon logique `wheelR`.
 * Plus haut = couleurs plus près du bord visuel de la texture ; trop haut = risque sur le jante métal.
 */
const WHEEL_COLOR_OUTER_R_FRAC = 0.86;

/**
 * Rayon intérieur de la couronne colorée : au-delà, **aucune** teinte (moyeu / texture PNG au centre).
 * Trop bas : le multiply teinte le moyeu métallique ; trop haut : couronne colorée étroite.
 * Les couleurs ne s’appliquent qu’entre `WHEEL_HUB_R_FRAC * r` et `WHEEL_COLOR_OUTER_R_FRAC * r`.
 */
const WHEEL_HUB_R_FRAC = 0.098;

/**
 * Cercle de **clip** pour les libellés — suit un peu l’anneau élargi pour ne pas rogner les textes.
 */
const WHEEL_LABEL_CLIP_R_FRAC = 0.82;

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

    ctx.fillStyle = fillCore;
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = Math.max(2, r * 0.04);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(0.5, r * 0.008);
    ctx.fillText(label, 0, 0);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    /** Repasse nette par-dessus l’ombre (lisibilité). */
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();
}

/**
 * Ombre + contact : deux passes pour ancrer la roue (affiche 3D).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawWheelGroundShadow(ctx, cx, cy, r) {
  const gy = cy + r * 0.78;
  ctx.save();
  // 1) Très large, très léger (pénombre)
  ctx.globalAlpha = 0.35;
  const g0 = ctx.createRadialGradient(cx, gy, r * 0.25, cx, gy, r * 1.45);
  g0.addColorStop(0, "rgba(0,0,0,0.15)");
  g0.addColorStop(0.4, "rgba(0,0,0,0.08)");
  g0.addColorStop(0.75, "rgba(0,0,0,0.02)");
  g0.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.ellipse(cx, gy, r * 1.2, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  // 2) Diffuse
  ctx.globalAlpha = 0.42;
  const g1 = ctx.createRadialGradient(cx, gy, r * 0.1, cx, gy, r * 1.18);
  g1.addColorStop(0, "rgba(0,0,0,0.32)");
  g1.addColorStop(0.35, "rgba(0,0,0,0.12)");
  g1.addColorStop(0.65, "rgba(0,0,0,0.04)");
  g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.ellipse(cx, gy, r * 1.0, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  // 3) Sous-roue (noir jamais plein : dégradé doux)
  ctx.globalAlpha = 0.4;
  const g2 = ctx.createRadialGradient(cx, gy, r * 0.12, cx, gy, r * 0.58);
  g2.addColorStop(0, "rgba(0,0,0,0.38)");
  g2.addColorStop(0.5, "rgba(0,0,0,0.12)");
  g2.addColorStop(0.88, "rgba(0,0,0,0.02)");
  g2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.ellipse(cx, gy, r * 0.88, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Halo chaud / lumière ambiante autour de la couronne (avant la texture).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawWheelBacklightHalo(ctx, cx, cy, r) {
  ctx.save();
  const hx = cx - r * 0.22;
  const hy = cy - r * 0.2;
  const h = ctx.createRadialGradient(hx, hy, r * 0.2, cx, cy, r * 1.42);
  h.addColorStop(0, "rgba(255, 248, 220, 0.18)");
  h.addColorStop(0.25, "rgba(255, 230, 200, 0.1)");
  h.addColorStop(0.5, "rgba(255, 200, 170, 0.04)");
  h.addColorStop(0.75, "rgba(140, 120, 220, 0.04)");
  h.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = h;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Bord brillant (haut de la jante) : relief verre / chrome. */
function drawWheelOuterRimGloss(ctx, cx, cy, r) {
  const rOut = r * 0.88;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, -Math.PI * 0.92, -Math.PI * 0.18, false);
  const g = ctx.createLinearGradient(cx - rOut, cy - rOut, cx + rOut * 0.2, cy - rOut * 0.3);
  g.addColorStop(0, "rgba(255,255,255,0.04)");
  g.addColorStop(0.3, "rgba(255,255,255,0.14)");
  g.addColorStop(0.55, "rgba(255,255,255,0.1)");
  g.addColorStop(0.8, "rgba(255,255,255,0.03)");
  g.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1.1, r * 0.016);
  ctx.lineCap = "round";
  ctx.stroke();
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
  /** Secteurs en couronne (pas de couleur au centre ; aucun moyeu blanc). */
  for (let i = 0; i < n; i++) {
    const { t0, t1 } = segmentAnglesEqual(i, n, offsetDeg);
    pathAnnulusSector(ctx, cx, cy, rIn, rOut, t0, t1);
    ctx.fillStyle = colors[i];
    ctx.fill();
  }
  // Centre volontairement laissé transparent pour éviter le rond blanc.
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
  const rOut = r * WHEEL_COLOR_OUTER_R_FRAC;
  const rIn = r * WHEEL_HUB_R_FRAC;

  ctx.save();
  /** Rien ne doit dépasser l’inset bord. */
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, 0, Math.PI * 2);
  ctx.clip();

  for (let i = 0; i < n; i++) {
    const { t0, t1 } = segmentAnglesEqual(i, n, offsetDeg);
    ctx.save();
    pathAnnulusSector(ctx, cx, cy, rIn, rOut, t0, t1);
    ctx.clip();

    // Étape 1 : fond plein couleur commerce
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors[i];
    pathAnnulusSector(ctx, cx, cy, rIn, rOut, t0, t1);
    ctx.fill();

    // Étape 2 : texture PNG par-dessus en multiply — zones sombres = ombres, zones claires = reflets colorés
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1;
    drawImageCover(ctx, roueImg, lx, ly, box, box);

    // Étape 3 : screen : reflets métal / relief de la texture
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.26;
    drawImageCover(ctx, roueImg, lx, ly, box, box);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }
  /** Centre laissé transparent (pas de rond blanc). */
  ctx.restore();
}

/**
 * Restaure une texture au moyeu pour éviter tout disque blanc.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {CanvasImageSource} roueImg
 * @param {(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void} drawImageCover
 */
function drawWheelHubTexture(ctx, cx, cy, r, roueImg, drawImageCover) {
  const box = r * 2;
  const lx = cx - r;
  const ly = cy - r;
  /** Même rayon que l’arête intérieure des parts (rIn) + léger chevauchement : évite l’anneau vide / fond qui transparaît. */
  const hubR = Math.max(2, r * WHEEL_HUB_R_FRAC * 1.012);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.96;
  drawImageCover(ctx, roueImg, lx, ly, box, box);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.28;
  drawImageCover(ctx, roueImg, lx, ly, box, box);
  const hubShade = ctx.createRadialGradient(cx, cy, hubR * 0.1, cx, cy, hubR);
  hubShade.addColorStop(0, "rgba(15,23,42,0.1)");
  hubShade.addColorStop(0.5, "rgba(15,23,42,0.16)");
  hubShade.addColorStop(1, "rgba(6,8,20,0.3)");
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = hubShade;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

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

/**
 * @param {CanvasImageSource | null} roueImg — texture chargée si `wheelRenderMode === "png"`.
 */
export function drawFlyerWheel(ctx, s, roueImg, wheelCx, wheelCy, wheelR, drawImageCover) {
  const colors = wheelSegmentColorsResolved(s);
  const userOff = typeof s.wheelSegmentOffsetDeg === "number" ? s.wheelSegmentOffsetDeg : 0;
  /** Mode verrouillé: dès que la texture est chargée, on l'utilise. */
  const usePng = Boolean(roueImg);

  drawWheelBacklightHalo(ctx, wheelCx, wheelCy, wheelR);
  drawWheelGroundShadow(ctx, wheelCx, wheelCy, wheelR);

  const labelOffsetDeg = usePng ? userOff + FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG : userOff;

  if (usePng) {
    const off = labelOffsetDeg;
    drawPngWheelSegmentTints(ctx, wheelCx, wheelCy, wheelR, roueImg, colors, off, drawImageCover);
    drawWheelHubTexture(ctx, wheelCx, wheelCy, wheelR, roueImg, drawImageCover);
  } else {
    drawWheelSegments(ctx, wheelCx, wheelCy, wheelR, colors, userOff);
  }
  drawWheelOuterRimGloss(ctx, wheelCx, wheelCy, wheelR);
  drawWheelSegmentLabels(ctx, wheelCx, wheelCy, wheelR, labelOffsetDeg, FLYER_WHEEL_SEGMENT_COUNT, s, colors);
}
