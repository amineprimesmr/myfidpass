import { initLandingAnimations } from "../features/landing.js";
import { initLiquidGlassMenu } from "../features/kube-liquid-glass/liquid-glass-menu.js";
import {
  runLiquidGlassMenuCleanupLanding,
  setLiquidGlassMenuDisposeLanding,
} from "../features/kube-liquid-glass/liquid-glass-menu-dispose.js";
import { mountLandingCinematic } from "../landing-cinematic/mount.jsx";

export default {
  init() {
    runLiquidGlassMenuCleanupLanding();
    const root = document.querySelector(
      "#landing-liquid-glass [data-liquid-glass-menu-root]"
    );
    const landing = document.getElementById("landing");
    if (root && landing) {
      setLiquidGlassMenuDisposeLanding(
        initLiquidGlassMenu({
          root,
          scrollLockEl: landing,
          fallbackClassTarget: landing,
        })
      );
    }
    initLandingAnimations();
    mountLandingCinematic();
  },
};
