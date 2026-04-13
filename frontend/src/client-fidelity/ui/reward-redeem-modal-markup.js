/**
 * Modale « utiliser une récompense » : QR membre (identique Wallet) + parcours en magasin.
 * @param {(s: string) => string} esc
 */
export function renderRewardRedeemModalMarkup(esc) {
  return `
<div id="fidelity-reward-redeem-modal" class="fidelity-reward-redeem-modal hidden" aria-hidden="true" role="dialog" aria-modal="true">
  <button type="button" class="fidelity-reward-redeem-modal__backdrop" aria-label="${esc("Fermer")}" tabindex="-1"></button>
  <div class="fidelity-reward-redeem-modal__panel" role="document">
    <button type="button" class="fidelity-reward-redeem-modal__close" data-fid-redeem-close aria-label="${esc("Fermer")}"><span aria-hidden="true">×</span></button>
    <div id="fidelity-reward-redeem-state-unlocked" class="fidelity-reward-redeem-modal__state hidden">
      <p class="fidelity-reward-redeem-modal__kicker">${esc("En boutique")}</p>
      <h2 id="fidelity-reward-redeem-heading" class="fidelity-reward-redeem-modal__title"></h2>
      <p class="fidelity-reward-redeem-modal__lead">${esc("Présente ce QR en caisse : c’est le même code que sur ta carte Wallet. Le personnel te scanne et valide ta récompense sur Fidpass.")}</p>
      <div class="fidelity-reward-redeem-modal__qr-wrap">
        <div id="fidelity-reward-redeem-qr-skel" class="fidelity-reward-redeem-modal__qr-skel" aria-hidden="true"></div>
        <img id="fidelity-reward-redeem-qr" class="fidelity-reward-redeem-modal__qr hidden" alt="" width="232" height="232" decoding="async" />
      </div>
      <ol class="fidelity-reward-redeem-modal__steps">
        <li class="fidelity-reward-redeem-modal__step"><span class="fidelity-reward-redeem-modal__step-num" aria-hidden="true">1</span><span>${esc("Rends-toi en magasin.")}</span></li>
        <li class="fidelity-reward-redeem-modal__step"><span class="fidelity-reward-redeem-modal__step-num" aria-hidden="true">2</span><span>${esc("Passe commande puis ouvre cet écran au moment du paiement.")}</span></li>
        <li class="fidelity-reward-redeem-modal__step"><span class="fidelity-reward-redeem-modal__step-num" aria-hidden="true">3</span><span>${esc("Le staff scanne le QR et enregistre la récompense sur ton compte.")}</span></li>
      </ol>
      <p id="fidelity-reward-redeem-fine" class="fidelity-reward-redeem-modal__fine"></p>
    </div>
    <div id="fidelity-reward-redeem-state-locked" class="fidelity-reward-redeem-modal__state hidden">
      <div class="fidelity-reward-redeem-modal__locked-visual" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h2 id="fidelity-reward-redeem-locked-heading" class="fidelity-reward-redeem-modal__title"></h2>
      <p id="fidelity-reward-redeem-locked-body" class="fidelity-reward-redeem-modal__locked-body"></p>
      <p class="fidelity-reward-redeem-modal__locked-hint">${esc("Continue à cumuler : ta jauge en haut de page indique où tu en es.")}</p>
    </div>
  </div>
</div>`;
}
