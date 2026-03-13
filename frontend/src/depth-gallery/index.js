/**
 * Depth Gallery — Codrops Atmospheric Depth Gallery
 * https://github.com/houmahani/codrops-depth-gallery
 * Remplaces le carousel par la galerie depth scroll.
 */
import "@/css/base.css";
import "@/css/canvas.css";
import { Engine } from "@/Experience/Engine";

let engineInstance = null;

export function mountDepthGallery() {
  const root = document.getElementById("landing-depth-gallery-root");
  const canvas = root?.querySelector(".webgl");
  if (!(canvas instanceof HTMLCanvasElement) || !root) {
    console.warn("Depth gallery: canvas or root not found");
    return;
  }
  if (engineInstance) return;
  const engine = new Engine(canvas);
  engineInstance = engine;
  // Léger délai pour laisser le DOM se stabiliser (animations hero, layout)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      engine.init().catch((err) => {
        console.error("Depth gallery init failed", err);
      });
    });
  });
}
