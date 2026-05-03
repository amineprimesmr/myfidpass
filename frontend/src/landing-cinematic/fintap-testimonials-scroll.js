/**
 * Progression 0–1 quand la section traverse le viewport (défilement témoignages).
 * @param {HTMLElement | null} el
 * @returns {number}
 */
export function scrollProgressThroughSection(el) {
  if (!el || typeof window === "undefined") return 0;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const start = vh * 0.95;
  const range = vh * 0.55 + rect.height * 0.75;
  const x = start - rect.top;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, x / range));
}
