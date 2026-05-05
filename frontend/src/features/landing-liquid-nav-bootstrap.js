import switcherMarkup from "../landing-cinematic/fooontic-kwp-ragr-switcher.fragment.html?raw";
import "../landing-cinematic/fooontic-kwp-ragr-switcher.css";
import { runFooonticKwpRaGrSwitcherPen } from "../landing-cinematic/fooontic-kwp-ragr-switcher.pen.js";
import {
  runLiquidGlassMenuCleanupLanding,
  setLiquidGlassMenuDisposeLanding,
} from "./kube-liquid-glass/liquid-glass-menu-dispose.js";

/**
 * Monte le switcher « Liquid Glass » (CodePen fooontic/KwpRaGr) dans #landing-liquid-glass.
 */
export function ensureLandingLiquidNav() {
  runLiquidGlassMenuCleanupLanding();

  const host = document.getElementById("landing-liquid-glass");
  const landing = document.getElementById("landing");
  if (!host || !landing) return;

  host.classList.add("landing-fooontic-switcher-host");
  host.innerHTML = switcherMarkup;
  runFooonticKwpRaGrSwitcherPen();

  setLiquidGlassMenuDisposeLanding(() => {
    host.innerHTML = "";
    host.classList.remove("landing-fooontic-switcher-host");
  });
}
