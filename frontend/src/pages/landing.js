import { ensureLandingLiquidNav } from "../features/landing-liquid-nav-bootstrap.js";
import { initLandingAnimations } from "../features/landing.js";
import { mountLandingCinematic } from "../landing-cinematic/mount.jsx";
import { updateAuthNavLinks } from "../router/index.js";

export default {
  init() {
    ensureLandingLiquidNav();
    updateAuthNavLinks();
    initLandingAnimations();
    mountLandingCinematic();
  },
};
