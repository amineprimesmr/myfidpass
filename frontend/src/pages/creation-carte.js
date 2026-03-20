/**
 * Page création de carte — affichée après "Terminer" dans l'onboarding.
 * Affiche l'animation card beam puis CTA vers checkout.
 */
import { initRouting } from "../router/index.js";

export default {
  init() {
    const cta = document.getElementById("creation-carte-cta");
    cta?.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/checkout");
      initRouting();
    });
  },
};
