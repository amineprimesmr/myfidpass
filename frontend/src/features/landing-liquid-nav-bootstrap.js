import { initLiquidGlassMenu } from "./kube-liquid-glass/liquid-glass-menu.js";
import {
  runLiquidGlassMenuCleanupLanding,
  setLiquidGlassMenuDisposeLanding,
} from "./kube-liquid-glass/liquid-glass-menu-dispose.js";

/**
 * Initialise le menu Liquid Glass du bloc #landing (accueil, pages SEO, légales).
 * Sans cet appel, le HTML du menu reste sans les classes / filtres appliqués par le JS → mise en page cassée.
 */
export function ensureLandingLiquidNav() {
  runLiquidGlassMenuCleanupLanding();
  const root = document.querySelector("#landing-liquid-glass [data-liquid-glass-menu-root]");
  const landing = document.getElementById("landing");
  if (!root || !landing) return;
  setLiquidGlassMenuDisposeLanding(
    initLiquidGlassMenu({
      root,
      scrollLockEl: landing,
      fallbackClassTarget: landing,
    })
  );
}
