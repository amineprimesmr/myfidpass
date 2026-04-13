import {
  deliveryReceiptFabAriaLabel,
  deliveryReceiptIntroModalBody,
  deliveryReceiptIntroModalTitle,
  deliveryReceiptStickyCtaLabel,
} from "../lib/program-copy.js";

/** Scooter de livraison + sac sur le porte-bagage (stroke). */
function deliveryScooterIconSvg() {
  return `<svg class="fidelity-delivery-fab__icon" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.75" cy="17" r="2.35"/><circle cx="18.25" cy="17" r="2.35"/><path d="M5.75 17 8.35 11.5h5.6l2.3 5.5"/><path d="M13.95 11.5 16.1 9.8V17"/><path d="M8.35 11.5V8.9M6.65 8.9h3.4"/><path d="M11.15 4.75h5.2c.45 0 .8.35.8.8v4.35h-6.8V5.55c0-.45.35-.8.8-.8z"/><path d="M11.15 7.85h6.8"/></svg>`;
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
        ${deliveryScooterIconSvg()}
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
