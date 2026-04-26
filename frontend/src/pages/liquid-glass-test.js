import "../liquid-glass-test.css";
import { initLiquidGlassMenu } from "../features/kube-liquid-glass/liquid-glass-menu.js";

/** Démonstration complète kube.io (SVG) — `public/vendor/kube-liquid-glass/`. */
const IFRAME_SRC = "/vendor/kube-liquid-glass/index.html";

export default {
  init() {
    initLiquidGlassMenu();
    const iframe = document.querySelector("#liquid-glass-test-app .liquid-glass-test-iframe");
    if (iframe) {
      iframe.src = `${IFRAME_SRC}?t=${Date.now()}`;
    }
  },
};
