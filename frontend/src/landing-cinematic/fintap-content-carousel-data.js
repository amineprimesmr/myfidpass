/**
 * Galerie landing (FinTapContentCarouselSection).
 * Fichiers : frontend/public/assets/image-caroussel/content-{1..10}.jpg (~520px).
 */
export const FINTAP_CONTENT_CAROUSEL_COUNT = 10;

export const FINTAP_CONTENT_CAROUSEL_IMAGES = Array.from(
  { length: FINTAP_CONTENT_CAROUSEL_COUNT },
  (_, i) => `/assets/image-caroussel/content-${i + 1}.jpg`
);

/**
 * @param {string[]} images
 * @returns {{ rowTop: string[], rowBottom: string[] }}
 */
export function splitContentCarouselRows(images) {
  const half = Math.ceil(images.length / 2);
  return {
    rowTop: images.slice(0, half),
    rowBottom: images.slice(half),
  };
}
