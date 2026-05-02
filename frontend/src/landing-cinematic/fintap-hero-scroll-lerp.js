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
const TILT_X_DEG = 38;
const TILT_Y_DEG = 0;
const TILT_Z_DEG = 0;

/** Zoom d’animation : départ resserré, fin taille de référence (1) */
const SCALE_ZOOMED = 1.52;
const SCALE_REST = 1;

/**
 * Verticale : départ plus haut (translateY < 0), fin position de repos plus bas (0).
 * Les px sont le déplacement appliqué sur le mockup 3D.
 */
const TRANSLATE_Y_START_HIGH = -44;
const TRANSLATE_Y_END_REST = 0;
/** Marge haute de la scène (fixe en CSS) — l’ancienne animation marginTop 24→200 est dans le translateY. */
const FINTAP_SCENE_LAYOUT_MARGIN_PX = 24;
const GAP_MOTION_PX = 200 - FINTAP_SCENE_LAYOUT_MARGIN_PX;

/**
 * @param {number} scrollY scroll courant
 * @param {number} scrollYAtRatio0 scroll à partir duquel l’effet vaut ratio 0
 *   (défini une fois, pas d’invalider sur resize iOS hauteur / barre d’adresse)
 * @param {number} [triggerDistance=TRIGGER]
 * @returns {number} entre 0 et 1
 */
export function fintapHeroScrollRatio(
  scrollY,
  scrollYAtRatio0,
  triggerDistance = TRIGGER
) {
  return clamp((scrollY - scrollYAtRatio0) / triggerDistance, 0, 1);
}

/**
 * @returns {number} scroll Y global (document)
 */
export function getPageScrollY() {
  if (typeof window === "undefined") return 0;
  const y = window.scrollY ?? window.pageYOffset;
  if (typeof y === "number" && Number.isFinite(y)) return y;
  const el = document.scrollingElement || document.documentElement;
  return Number(el?.scrollTop) || 0;
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
 *   rotateX: number, rotateY: number, rotateZ: number, scale: number, translateY: number
 * }}
 */
export function computeFintapHeroPhoneStyle(scrollRatio) {
  const t = clamp(scrollRatio, 0, 1);
  return {
    rotateX: TILT_X_DEG * (1 - t),
    rotateY: TILT_Y_DEG * (1 - t),
    rotateZ: TILT_Z_DEG * (1 - t),
    scale: lerp(SCALE_ZOOMED, SCALE_REST, t),
    translateY:
      lerp(TRANSLATE_Y_START_HIGH, TRANSLATE_Y_END_REST, t) +
      lerp(0, GAP_MOTION_PX, t),
  };
}
