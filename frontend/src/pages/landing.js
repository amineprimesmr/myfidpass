import { initLandingAnimations } from "../features/landing.js";
import { mountLandingCinematic } from "../landing-cinematic/mount.jsx";

export default {
  init() {
    initLandingAnimations();
    mountLandingCinematic();
  },
};
