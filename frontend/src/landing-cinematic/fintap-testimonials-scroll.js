/**
 * Progression 0–1 quand la section traverse le viewport (défilement témoignages / carousels).
 * @param {HTMLElement | null} el
 * @param {{
 *   startViewportRatio?: number;
 *   viewportRangeRatio?: number;
 *   heightFactor?: number;
 *   gain?: number;
 * }} [opts]
 * @returns {number}
 */
export function scrollProgressThroughSection(el, opts = {}) {
  if (!el || typeof window === "undefined") return 0;
  const {
    startViewportRatio = 0.95,
    viewportRangeRatio = 0.55,
    heightFactor = 0.75,
    gain = 1,
  } = opts;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const start = vh * startViewportRatio;
  const range = vh * viewportRangeRatio + rect.height * heightFactor;
  const x = start - rect.top;
  if (range <= 0) return 0;
  const raw = Math.max(0, Math.min(1, x / range));
  return Math.max(0, Math.min(1, raw * gain));
}
