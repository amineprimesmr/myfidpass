/**
 * Mount point for helmet (Scroll-Driven 3D Image Tube) - https://github.com/matdn/helmet
 */
import { createRoot } from "react-dom/client";
import { FiberScene } from "./FiberScene.jsx";

let mounted = false;

export function mountHelmet() {
  const root = document.getElementById("landing-helmet-root");
  if (!root || mounted) return;
  mounted = true;
  createRoot(root).render(<FiberScene />);
}
