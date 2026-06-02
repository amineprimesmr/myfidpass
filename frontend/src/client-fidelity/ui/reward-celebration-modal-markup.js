/**
 * Modale célébration : bienvenue (récompense début) + palier atteint.
 * @param {(s: string) => string} esc
 */
export function renderRewardCelebrationModalMarkup(esc) {
  return `
<div id="fidelity-reward-celebration-modal" class="fidelity-reward-celebration hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="fidelity-reward-celebration-title">
  <button type="button" class="fidelity-reward-celebration__backdrop" data-fid-celebration-close aria-label="${esc("Fermer")}" tabindex="-1"></button>
  <div class="fidelity-reward-celebration__panel" role="document">
    <div class="fidelity-reward-celebration__hero" aria-hidden="true">
      <div class="fidelity-reward-celebration__glow"></div>
      <div class="fidelity-reward-celebration__ring"></div>
      <div class="fidelity-reward-celebration__medal">★</div>
    </div>
    <p class="fidelity-reward-celebration__kicker" id="fidelity-reward-celebration-kicker"></p>
    <h2 id="fidelity-reward-celebration-title" class="fidelity-reward-celebration__title"></h2>
    <p id="fidelity-reward-celebration-lead" class="fidelity-reward-celebration__lead"></p>
    <div class="fidelity-reward-celebration__visual-wrap">
      <img id="fidelity-reward-celebration-img" class="fidelity-reward-celebration__img" alt="" width="120" height="120" decoding="async" />
    </div>
    <p id="fidelity-reward-celebration-prize" class="fidelity-reward-celebration__prize hidden"></p>
    <p id="fidelity-reward-celebration-bonus" class="fidelity-reward-celebration__bonus hidden"></p>
    <div class="fidelity-reward-celebration__actions">
      <button type="button" class="fidelity-reward-celebration__cta fidelity-reward-celebration__cta--primary" id="fidelity-reward-celebration-primary" data-fid-celebration-primary></button>
    </div>
  </div>
</div>`;
}
