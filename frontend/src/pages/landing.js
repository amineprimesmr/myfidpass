import { ensureLandingLiquidNav } from "../features/landing-liquid-nav-bootstrap.js";
import { initLandingAnimations } from "../features/landing.js";
import { mountLandingCinematic } from "../landing-cinematic/mount.jsx";

export default {
  init() {
    ensureLandingLiquidNav();
    initLandingAnimations();
    mountLandingCinematic();
  },
};
