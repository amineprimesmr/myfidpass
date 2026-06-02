/**
 * Nettoyage des voiles / modales client fidélité — évite page bloquée en flou
 * (overlay chargement, backdrop-filter, overflow:hidden oubliés).
 */
import { forceDismissFidelityRouteLoadingOverlay } from "./fidelity-route-loading.js";

/**
 * @param {ParentNode | null | undefined} rootEl
 */
export function resetFidelityClientPageUi(rootEl) {
  forceDismissFidelityRouteLoadingOverlay();

  document.documentElement.classList.remove("fidpass-fidelity-route-loading");
  document.body.removeAttribute("aria-busy");
  document.body.style.overflow = "";
  document.body.classList.remove("fidelity-missions-sheet-locked");

  if (!(rootEl instanceof HTMLElement)) return;

  const celeb = rootEl.querySelector("#fidelity-reward-celebration-modal");
  if (celeb instanceof HTMLElement) {
    celeb.classList.add("hidden");
    celeb.classList.remove("fidelity-reward-celebration--open", "fidelity-reward-celebration--instant");
    celeb.setAttribute("aria-hidden", "true");
  }

  const redeem = rootEl.querySelector("#fidelity-reward-redeem-modal");
  if (redeem instanceof HTMLElement) {
    redeem.classList.add("hidden");
    redeem.classList.remove("fidelity-reward-redeem-modal--open", "fidelity-reward-redeem-modal--instant");
    redeem.setAttribute("aria-hidden", "true");
    const qrImg = redeem.querySelector("#fidelity-reward-redeem-qr");
    const qrSkel = redeem.querySelector("#fidelity-reward-redeem-qr-skel");
    if (qrImg instanceof HTMLImageElement) {
      qrImg.src = "";
      qrImg.classList.add("hidden");
    }
    qrSkel?.classList.remove("hidden");
  }

  const missions = rootEl.querySelector("#fidelity-missions-sheet");
  if (missions instanceof HTMLElement) {
    missions.classList.remove("fidelity-missions-sheet--open");
    missions.setAttribute("aria-hidden", "true");
    rootEl.querySelector("#fidelity-missions-sheet-open")?.setAttribute("aria-expanded", "false");
  }

  const profileModal = rootEl.querySelector("#fidelity-profile-mission-modal");
  if (profileModal instanceof HTMLElement && !profileModal.classList.contains("hidden")) {
    profileModal.classList.add("hidden");
    profileModal.setAttribute("aria-hidden", "true");
  }

  const deliveryIntro = rootEl.querySelector("#fidelity-delivery-receipt-intro-modal");
  if (deliveryIntro instanceof HTMLElement && !deliveryIntro.classList.contains("hidden")) {
    deliveryIntro.classList.add("hidden");
    deliveryIntro.setAttribute("aria-hidden", "true");
    rootEl.querySelector("#fidelity-delivery-receipt-fab-btn")?.setAttribute("aria-expanded", "false");
  }
}
