/** Images carousel — versions légères 520px (/assets/carousel/) */
export const FINTAP_CONTENT_CAROUSEL_IMAGES = Array.from({ length: 10 }, (_, i) => {
  return `/assets/carousel/content-${i + 1}.jpg`;
});

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
