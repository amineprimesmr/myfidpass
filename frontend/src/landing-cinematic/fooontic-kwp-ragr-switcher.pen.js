import { FINTAP_SCROLL_TO_COMMERCE_EVENT } from "./fintap-hero-scroll-lerp.js";
import { getAuthToken } from "../config.js";

/** CodePen fooontic/KwpRaGr — logique init (appelée après injection du HTML). */
export function runFooonticKwpRaGrSwitcherPen() {
  const switcher = document.querySelector(".switcher");
  if (!switcher) return;
  switcher.classList.toggle("switcher--authed", !!getAuthToken());

  const SCROLL_ACTIONS = {
    "1": () => window.scrollTo({ top: 0, behavior: "smooth" }), // home → top of page
    "2": () => {
      const target = document.querySelector("#comment-ca-marche");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "3": () => {
      const target = document.querySelector("#testimonials");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "4": () => {
      // Si l'utilisateur est déjà connecté, l'envoyer directement vers le SaaS.
      if (getAuthToken()) {
        window.location.assign("/app");
        return;
      }
      // Sinon, déclencher le scroll animé piloté par la section hero vers l'onboarding commerce.
      window.dispatchEvent(new CustomEvent(FINTAP_SCROLL_TO_COMMERCE_EVENT));
    },
  };

  const trackPrevious = (el) => {
    const radios = el.querySelectorAll('input[type="radio"]');
    let previousValue = null;

    const initiallyChecked = el.querySelector('input[type="radio"]:checked');
    if (initiallyChecked) {
      previousValue = initiallyChecked.getAttribute("c-option");
      el.setAttribute("c-previous", previousValue);
    }

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          el.setAttribute("c-previous", previousValue ?? "");
          previousValue = radio.getAttribute("c-option");

          const option = radio.getAttribute("c-option");
          const action = SCROLL_ACTIONS[option];
          if (action) action();
        }
      });
    });
  };

  trackPrevious(switcher);

  // Permet de relancer l'action "Démarrer" même si l'option 4 est déjà sélectionnée.
  const commerceRadio = switcher.querySelector('input[c-option="4"]');
  const commerceOption = commerceRadio?.closest(".switcher__option");
  commerceOption?.addEventListener("click", () => {
    if (commerceRadio?.checked) {
      const action = SCROLL_ACTIONS["4"];
      if (action) action();
    }
  });
}
