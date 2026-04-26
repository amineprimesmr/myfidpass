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
 * @param {number} scrollRatio
 * @returns {{
 *   rotateX: number, rotateY: number, rotateZ: number, scale: number, translateY: number,
 *   shadowY: number, shadowBlur: number, shadowAlpha: number
 * }}
 */
export function computeFintapHeroPhoneStyle(scrollRatio) {
  const t = clamp(scrollRatio, 0, 1);
  return {
    rotateX: 18 * (1 - t),
    rotateY: t >= 1 ? 0 : -6 * (1 - t),
    rotateZ: 2 * (1 - t),
    scale: 0.88 + 0.12 * t,
    translateY: 30 * (1 - t),
    shadowY: lerp(60, 20, t),
    shadowBlur: lerp(120, 50, t),
    shadowAlpha: lerp(0.25, 0.12, t),
  };
}
