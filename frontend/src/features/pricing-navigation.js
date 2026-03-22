/**
 * Navigation fiable vers /choisir-offre : interception en capture pour éviter
 * tout autre handler ou navigation native vers /login par erreur.
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
      const a = e.target.closest?.("a");
      if (!a) return;
      const t = a.getAttribute("target");
      if (t && t !== "_self") return;
      const raw = (a.getAttribute("href") || "").trim();
      const path = raw.split("?")[0].replace(/\/$/, "") || "/";
      if (path !== "/choisir-offre") return;
      if (!a.closest("#landing") && !a.closest("#auth-app")) return;
      goPricing(e);
    },
    true
  );

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target?.id !== "landing-hero-form") return;
      goPricing(e);
    },
    true
  );
}
