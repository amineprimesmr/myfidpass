/**
 * Index d’étape (0…n-1) à partir de la position du track dans le viewport.
 * @param {number} trackTop — getBoundingClientRect().top du conteneur « piste » (ou section)
 * @param {number} trackHeightPx — offsetHeight (hauteur de défilement utile)
 * @param {number} innerHeight — hauteur viewport utile (ex. visualViewport.height)
 * @param {number} stepCount
 * @param {number} [stickyTopPx=0] — offset sticky (nav), en px résolus (CSS top du bloc sticky)
 * @returns {number}
 */
export function stepsIndexFromScrollProgress(
  trackTop,
  trackHeightPx,
  innerHeight,
  stepCount,
  stickyTopPx = 0,
) {
  const n = Math.max(1, Math.floor(stepCount));
  const pinViewport = Math.max(1, innerHeight - Math.max(0, stickyTopPx));
  const total = Math.max(1, trackHeightPx - pinViewport);
  const passed = Math.max(0, -trackTop);
  const p = Math.min(1, passed / total);
  return Math.min(n - 1, Math.floor(p * n));
}

/**
 * Index d’étape (0…n-1) à partir du rect de la section scrollable.
 * @param {DOMRect} rect
 * @param {number} innerHeight
 * @param {number} stepCount
 * @returns {number}
 */
export function stepsIndexFromRect(rect, innerHeight, stepCount, stickyTopPx = 0) {
  return stepsIndexFromScrollProgress(rect.top, rect.height, innerHeight, stepCount, stickyTopPx);
}

/**
 * Progression 0–1 pour translation douce de la colonne gauche.
 * @param {number} trackTop
 * @param {number} trackHeightPx
 * @param {number} innerHeight
 * @returns {number}
 */
export function stepsLeftParallaxFromProgress(
  trackTop,
  trackHeightPx,
  innerHeight,
  stickyTopPx = 0,
) {
  const pinViewport = Math.max(1, innerHeight - Math.max(0, stickyTopPx));
  const total = Math.max(1, trackHeightPx - pinViewport);
  const passed = Math.max(0, -trackTop);
  return Math.min(1, passed / total);
}

/**
 * Progression 0–1 pour translation douce de la colonne gauche.
 * @param {DOMRect} rect
 * @param {number} innerHeight
 * @returns {number}
 */
export function stepsLeftParallaxProgress(rect, innerHeight, stickyTopPx = 0) {
  return stepsLeftParallaxFromProgress(rect.top, rect.height, innerHeight, stickyTopPx);
}
