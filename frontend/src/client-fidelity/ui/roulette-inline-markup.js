/**
 * Roulette en bas de page fidélité (sans titre marketing ni page séparée).
 * @param {(s: string) => string} esc
 * @param {{ tickets: number, spinCtaAriaLabel: string, ticketStatusDotClass: string }} p
 */
export function renderRouletteInlineMarkup(esc, p) {
  const { tickets, spinCtaAriaLabel, ticketStatusDotClass } = p;
  const t = esc(String(tickets));
  const plural = tickets !== 1 ? "s" : "";
  return `
      <section class="fidelity-v2-roulette-inline" id="fidelity-v2-roulette-block" aria-label="Roulette">
        <div class="fidelity-v2-roulette-inline-controls">
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <button id="fidelity-v2-spin-btn" class="fidelity-cta-pill fidelity-cta-pill--wheel-cta" type="button" aria-label="${esc(spinCtaAriaLabel)}">
              <span class="fidelity-cta-wheel-line">
                <span class="${esc(ticketStatusDotClass)}" aria-hidden="true"></span>
                <span class="fidelity-cta-wheel-emoji" aria-hidden="true">🎟️</span>
                <span id="fidelity-v2-tickets-display" class="fidelity-cta-wheel-tickets">${t} ticket${plural}</span>
                <span class="fidelity-cta-wheel-sep" aria-hidden="true">·</span>
                <span class="fidelity-cta-wheel-action">Jouer</span>
                <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
              </span>
            </button>
          </span>
        </div>
        <div class="fidelity-roulette-wheel-zone">
          <div class="fidelity-roulette-wheel-mount">
            <div class="fidelity-roulette-wheel-outer">
              <div class="fidelity-roulette-wheel" id="fidelity-roulette-wheel"></div>
              <div class="fidelity-roulette-wheel-rim" aria-hidden="true"></div>
              <div class="fidelity-roulette-indicator" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <p id="fidelity-v2-game-feedback" class="fidelity-roulette-feedback fidelity-v2-roulette-feedback hidden"></p>
      </section>`;
}
