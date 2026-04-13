import {
  deliveryReceiptFabAriaLabel,
  deliveryReceiptIntroModalBody,
  deliveryReceiptIntroModalTitle,
  deliveryReceiptStickyCtaLabel,
} from "../lib/program-copy.js";

/** Icône colis / livraison (stroke). */
function deliveryPackageIconSvg() {
  return `<svg class="fidelity-delivery-fab__icon" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
}

/**
 * FAB bas-droite + modale explicative + input file caché.
 * @param {(s: string) => string} esc
 * @param {string} programType
 */
export function renderDeliveryReceiptFabAndModalMarkup(esc, programType) {
  const title = esc(deliveryReceiptIntroModalTitle());
  const body = esc(deliveryReceiptIntroModalBody(programType));
  const claimLabel = esc(deliveryReceiptStickyCtaLabel(programType));
  const fabAria = esc(deliveryReceiptFabAriaLabel(programType));

  return `
    <div class="fidelity-delivery-sticky" role="region" aria-label="${fabAria}">
      <input type="file" id="fidelity-delivery-receipt-file" class="fidelity-delivery-receipt-file-input" accept="image/*" capture="environment" aria-label="${esc("Photographier ou choisir une image du ticket de livraison")}" />
      <p id="fidelity-delivery-receipt-feedback" class="fidelity-delivery-toast fidelity-engagement-feedback hidden" role="status"></p>
      <button type="button" id="fidelity-delivery-receipt-fab-btn" class="fidelity-delivery-fab" aria-haspopup="dialog" aria-expanded="false" aria-controls="fidelity-delivery-receipt-intro-modal" title="${fabAria}">
        ${deliveryPackageIconSvg()}
      </button>
      <div id="fidelity-delivery-receipt-intro-modal" class="fidelity-delivery-intro-modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="fidelity-delivery-receipt-intro-title">
        <button type="button" class="fidelity-delivery-intro-modal__backdrop" aria-label="${esc("Fermer")}"></button>
        <div class="fidelity-delivery-intro-modal__panel">
          <div class="fidelity-delivery-intro-modal__head">
            <h2 id="fidelity-delivery-receipt-intro-title" class="fidelity-delivery-intro-modal__title">${title}</h2>
            <button type="button" class="fidelity-delivery-intro-modal__close" aria-label="${esc("Fermer")}"><span aria-hidden="true">×</span></button>
          </div>
          <p class="fidelity-delivery-intro-modal__body">${body}</p>
          <div class="fidelity-delivery-intro-modal__actions">
            <button type="button" id="fidelity-delivery-receipt-claim-btn" class="fidelity-cta-pill fidelity-delivery-intro-modal__claim">${claimLabel}</button>
          </div>
        </div>
      </div>
    </div>`;
}
