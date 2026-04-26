import "../liquid-glass-test.css";
import { initLiquidGlassMenu } from "../features/kube-liquid-glass/liquid-glass-menu.js";
import {
  runLiquidGlassMenuCleanupTest,
  setLiquidGlassMenuDisposeTest,
} from "../features/kube-liquid-glass/liquid-glass-menu-dispose.js";

/** Démonstration complète kube.io (SVG) — `public/vendor/kube-liquid-glass/`. */
const IFRAME_SRC = "/vendor/kube-liquid-glass/index.html";

export default {
  init() {
    runLiquidGlassMenuCleanupTest();
    const testApp = document.getElementById("liquid-glass-test-app");
    const root = testApp?.querySelector("[data-liquid-glass-menu-root]");
    if (root && testApp) {
      setLiquidGlassMenuDisposeTest(
        initLiquidGlassMenu({
          root,
          scrollLockEl: testApp,
          fallbackClassTarget: testApp,
        })
      );
    }
    const iframe = document.querySelector("#liquid-glass-test-app .liquid-glass-test-iframe");
    if (iframe) {
      iframe.src = `${IFRAME_SRC}?t=${Date.now()}`;
    }
  },
};
