/**
 * Ouverture page tarifs : uniquement les liens marqués data-fidpass-open-pricing
 * (aucune confusion possible avec Se connecter / Mon espace).
 */
import { navigateToPricing } from "../router/index.js";

function goPricing(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  navigateToPricing().catch((err) => console.error("[Myfidpass] navigation tarifs", err));
}

export function initPricingNavigation() {
  document.addEventListener(
    "click",
    (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[data-fidpass-open-pricing]");
      if (!a) return;
      const t = a.getAttribute("target");
      if (t && t !== "_self") return;
      if (!a.closest("#landing") && !a.closest("#auth-app")) return;
      goPricing(e);
    },
    true
  );

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target?.id !== "landing-hero-form") return;
      const name = document.getElementById("landing-etablissement")?.value?.trim();
      const submitBtn = document.getElementById("landing-hero-submit");
      if (!name || submitBtn?.disabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        goPricing(e);
      }
    },
    true
  );
}
