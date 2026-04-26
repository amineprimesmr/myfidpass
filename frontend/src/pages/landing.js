import { initLandingAnimations } from "../features/landing.js";
import { initLiquidGlassMenu } from "../features/kube-liquid-glass/liquid-glass-menu.js";
import { mountLandingCinematic } from "../landing-cinematic/mount.jsx";

let disposeLandingLiquidMenu = null;

export function cleanupLandingLiquidMenu() {
  if (disposeLandingLiquidMenu) {
    disposeLandingLiquidMenu();
    disposeLandingLiquidMenu = null;
  }
}

export default {
  init() {
    if (disposeLandingLiquidMenu) disposeLandingLiquidMenu();
    const root = document.querySelector(
      "#landing-liquid-glass [data-liquid-glass-menu-root]"
    );
    const landing = document.getElementById("landing");
    if (root && landing) {
      disposeLandingLiquidMenu = initLiquidGlassMenu({
        root,
        scrollLockEl: landing,
        fallbackClassTarget: landing,
      });
    }
    initLandingAnimations();
    mountLandingCinematic();
  },
};
