import { buildWheelConicGradient, WHEEL_SEGMENT_COUNT } from "../lib/wheel-segments.js";

/**
 * Roulette en bas de page fidélité (sans titre marketing ni page séparée).
 * @param {(s: string) => string} esc
 * @param {{ tickets: number, spinCtaAriaLabel: string, ticketStatusDotClass: string, variant?: "default"|"qr" }} p
 */
export function renderRouletteInlineMarkup(esc, p) {
  const { tickets, spinCtaAriaLabel, ticketStatusDotClass, variant = "default" } = p;
  const qr = variant === "qr";
  const t = esc(String(tickets));
  const ptsWord = tickets === 1 ? "point" : "points";
  /** Rendu immédiat des parts (évite disque noir avant exécution de initRouletteWheel). */
  const wheelBgEsc = esc(buildWheelConicGradient(WHEEL_SEGMENT_COUNT));
  /** Fond sur `.fidelity-roulette-wheel-bg` : même rendu que `applyWheelFaceGradient` (évite bug WebKit au spin). */
  const innerBtn = qr
    ? `<span class="fidelity-shiny-cta__label">
                <span>Jouer la partie</span>
              </span>`
    : `<span class="fidelity-cta-wheel-line">
                <span class="${esc(ticketStatusDotClass)}" aria-hidden="true"></span>
                <span class="fidelity-cta-wheel-emoji" aria-hidden="true">⭐</span>
                <span id="fidelity-v2-tickets-display" class="fidelity-cta-wheel-tickets">${t} ${ptsWord}</span>
                <span class="fidelity-cta-wheel-sep" aria-hidden="true">·</span>
                <span class="fidelity-cta-wheel-action">Jouer</span>
                <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
              </span>`;
  return `
      <section class="fidelity-v2-roulette-inline ${qr ? "fidelity-v2-roulette-inline--qr" : ""}" id="fidelity-v2-roulette-block" aria-label="Roulette">
        <div class="fidelity-v2-roulette-inline-controls">
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full ${qr ? "fidelity-cta-wrap--qr-play fidelity-earn-points-cta-wrap fidelity-cta-wrap--qr-play-attention" : ""}">
            <button
              id="fidelity-v2-spin-btn"
              class="${qr ? "fidelity-shiny-cta fidelity-shiny-cta--missions-gift fidelity-shiny-cta--qr-play" : "fidelity-cta-pill fidelity-cta-pill--wheel-cta"}"
              type="button"
              aria-label="${esc(spinCtaAriaLabel)}"
            >
              ${innerBtn}
            </button>
          </span>
        </div>
        <div class="fidelity-roulette-wheel-zone">
          <div class="fidelity-roulette-wheel-mount">
            <div class="fidelity-roulette-wheel-outer">
              <div class="fidelity-roulette-wheel" id="fidelity-roulette-wheel">
                <div class="fidelity-roulette-wheel-bg" aria-hidden="true" style="background: ${wheelBgEsc};"></div>
              </div>
              <div class="fidelity-roulette-wheel-rim" aria-hidden="true"></div>
              <div class="fidelity-roulette-indicator" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <p id="fidelity-v2-game-feedback" class="fidelity-roulette-feedback fidelity-v2-roulette-feedback hidden"></p>
      </section>`;
}
