/**
 * Sheet « missions bonus » + CTA hero.
 * @param {(s: string) => string} esc
 */
export function renderEarnMorePointsButtonMarkup(esc) {
  return `
          <div class="fidelity-earn-points-cta-wrap">
            <button
              type="button"
              id="fidelity-missions-sheet-open"
              class="fidelity-earn-points-cta"
              aria-haspopup="dialog"
              aria-expanded="false"
              aria-controls="fidelity-missions-sheet"
            >
              <span class="fidelity-earn-points-cta__glow" aria-hidden="true"></span>
              <span class="fidelity-earn-points-cta__inner">
                <span class="fidelity-earn-points-cta__emoji" aria-hidden="true">🎁</span>
                <span class="fidelity-earn-points-cta__text">${esc("Gagner plus de points")}</span>
                <span class="fidelity-earn-points-cta__chev" aria-hidden="true">›</span>
              </span>
            </button>
          </div>`;
}

/**
 * @param {(s: string) => string} esc
 * @param {{ engagementHtml: string, sheetTitle: string }} p
 */
export function renderMissionsSheetMarkup(esc, p) {
  const title = esc(String(p.sheetTitle || "Missions"));
  return `
    <div
      id="fidelity-missions-sheet"
      class="fidelity-missions-sheet"
      role="dialog"
      aria-modal="true"
      aria-hidden="true"
      aria-labelledby="fidelity-missions-sheet-title"
    >
      <div class="fidelity-missions-sheet__backdrop" data-fidelity-missions-sheet-backdrop tabindex="-1"></div>
      <div class="fidelity-missions-sheet__panel">
        <div class="fidelity-missions-sheet__handle-row" aria-hidden="true">
          <span class="fidelity-missions-sheet__handle"></span>
        </div>
        <header class="fidelity-missions-sheet__head">
          <div class="fidelity-missions-sheet__head-text">
            <p class="fidelity-missions-sheet__kicker">${esc("Bonus fidélité")}</p>
            <h2 id="fidelity-missions-sheet-title" class="fidelity-missions-sheet__title">${title}</h2>
            <p class="fidelity-missions-sheet__sub">${esc("Complète une action et récupère tes points.")}</p>
          </div>
          <button
            type="button"
            class="fidelity-missions-sheet__close"
            data-fidelity-missions-sheet-close
            aria-label="Fermer"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div class="fidelity-missions-sheet__body">
          <div class="fidelity-engagement-actions" id="fidelity-v2-actions">${p.engagementHtml}</div>
          <p id="fidelity-v2-action-feedback" class="fidelity-engagement-feedback hidden" role="status"></p>
        </div>
      </div>
    </div>`;
}
