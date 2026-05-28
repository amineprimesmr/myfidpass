/**
 * Overlay « vérification » missions (réseaux / avis externes) — réutilise les styles QR verify.
 */

export function renderEngagementVerifyOverlayMarkup() {
  return `
    <div
      id="fidelity-engagement-verify-root"
      class="fidelity-engagement-verify-root hidden"
      aria-hidden="true"
    >
      <div class="fidelity-engagement-verify-root__backdrop" aria-hidden="true"></div>
      <div
        id="fidelity-engagement-panel-verify"
        class="fidelity-qr-modal fidelity-qr-modal--verify fidelity-engagement-verify-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fidelity-engagement-verify-title"
      >
        <h2 id="fidelity-engagement-verify-title" class="fidelity-qr-modal-title">Validation de ta mission</h2>
        <div
          class="fidelity-qr-verify-progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuetext="Vérification en cours"
          id="fidelity-engagement-verify-progress"
        >
          <span class="fidelity-qr-verify-progress-bar" id="fidelity-engagement-verify-progress-bar"></span>
        </div>
        <p class="fidelity-qr-verify-msg" id="fidelity-engagement-verify-text" aria-live="polite"></p>
        <div class="fidelity-qr-verify-spinner-wrap">
          <div class="fidelity-qr-verify-logo-wrap" aria-hidden="true">
            <span class="fidelity-qr-verify-logo-ring"></span>
          </div>
          <span class="fidelity-qr-verify-spinner-label">Vérification</span>
        </div>
      </div>
    </div>`;
}
