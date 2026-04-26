/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

const TRIGGER = 400;

/** Contre-plongée (vue du bas) — uniquement rotateX, pas d’inclinaison latérale */
const TILT_X_DEG = 36;
const TILT_Y_DEG = 0;
const TILT_Z_DEG = 0;

/** Zoom d’animation : départ resserré, fin taille de référence (1) */
const SCALE_ZOOMED = 1.45;
const SCALE_REST = 1;

/**
 * Verticale : départ plus haut (translateY < 0), fin position de repos plus bas (0).
 * Les px sont le déplacement appliqué sur le mockup 3D.
 */
const TRANSLATE_Y_START_HIGH = -64;
const TRANSLATE_Y_END_REST = 0;

/**
 * @param {number} scrollY
 * @param {number} sectionTopY
 * @param {number} [triggerDistance=TRIGGER]
 * @returns {number} entre 0 et 1
 */
export function fintapHeroScrollRatio(
  scrollY,
  sectionTopY,
  triggerDistance = TRIGGER
) {
  return clamp((scrollY - sectionTopY) / triggerDistance, 0, 1);
}

/**
 * Ratio 0 = section à la position « initiale » (réf. viewport) ; 1 = décalage ≈ 400px vers le haut.
 * Fonctionne que le scroll soit sur window ou un conteneur.
 *
 * @param {number} initialSectionTop
 * @param {number} currentSectionTop
 * @param {number} [triggerDistance=TRIGGER]
 * @returns {number} entre 0 et 1
 */
export function fintapHeroScrollRatioFromViewport(
  initialSectionTop,
  currentSectionTop,
  triggerDistance = TRIGGER
) {
  return clamp(
    (initialSectionTop - currentSectionTop) / triggerDistance,
    0,
    1
  );
}

/**
 * @param {number} scrollRatio
 * @returns {{
 *   rotateX: number, rotateY: number, rotateZ: number, scale: number, translateY: number,
 *   shadowY: number, shadowBlur: number, shadowAlpha: number, topGap: number
 * }}
 */
export function computeFintapHeroPhoneStyle(scrollRatio) {
  const t = clamp(scrollRatio, 0, 1);
  return {
    rotateX: TILT_X_DEG * (1 - t),
    rotateY: TILT_Y_DEG * (1 - t),
    rotateZ: TILT_Z_DEG * (1 - t),
    scale: lerp(SCALE_ZOOMED, SCALE_REST, t),
    translateY: lerp(TRANSLATE_Y_START_HIGH, TRANSLATE_Y_END_REST, t),
    shadowY: lerp(60, 20, t),
    shadowBlur: lerp(120, 50, t),
    shadowAlpha: lerp(0.25, 0.12, t),
    topGap: lerp(16, 140, t),
  };
}
