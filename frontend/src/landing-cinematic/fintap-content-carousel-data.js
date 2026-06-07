/**
 * Galerie landing (FinTapContentCarouselSection).
 * Fichiers : frontend/public/assets/image-caroussel/content-{1..N}.jpg (~520px).
 * Garder cette liste alignée avec les fichiers réellement présents dans le dossier.
 */
const FINTAP_CONTENT_CAROUSEL_VERSION = 4;

export const FINTAP_CONTENT_CAROUSEL_IMAGES = [
  `/assets/image-caroussel/content-1.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-2.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-3.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-4.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-5.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-6.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-7.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
  `/assets/image-caroussel/content-8.jpg?v=${FINTAP_CONTENT_CAROUSEL_VERSION}`,
];

export const FINTAP_CONTENT_CAROUSEL_COUNT = FINTAP_CONTENT_CAROUSEL_IMAGES.length;

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
