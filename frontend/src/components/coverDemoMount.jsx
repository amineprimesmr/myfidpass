/**
 * Mount point for CoverDemo headline — https://ui.aceternity.com/components/container-cover
 */
import { createRoot } from "react-dom/client";
import { CoverDemo } from "./CoverDemo.jsx";

let mounted = false;

export function mountCoverDemo() {
  const root = document.getElementById("landing-cover-demo-root");
  if (!root || mounted) return;
  mounted = true;
  createRoot(root).render(<CoverDemo />);
}
