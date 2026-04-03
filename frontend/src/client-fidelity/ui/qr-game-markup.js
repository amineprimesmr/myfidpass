/**
 * Parcours QR : roue en premier, modales Google → vérif → gain → inscription (prénom + email).
 */

/**
 * @param {(s: string) => string} esc
 * @param {object} p
 */
export function renderQrGamePage(esc, p) {
  const {
    businessNameEsc,
    businessTaglineEsc,
    rouletteHtml,
    googleReviewUrl,
    logoUrl,
    logoUrlPublicFallback,
    qrThanksHeroMode = false,
  } = p;
  const heroTitleEsc = qrThanksHeroMode ? esc("Merci, bonne chance !") : businessNameEsc;
  const heroTaglineEsc = qrThanksHeroMode ? businessNameEsc : businessTaglineEsc;
  const heroTitleClass = `fidelity-qr-title${qrThanksHeroMode ? " fidelity-qr-title--thanks" : ""}`;

  const hasGoogle = Boolean(googleReviewUrl);
  const googleHref = hasGoogle ? String(googleReviewUrl).replace(/"/g, "&quot;") : "";

  let qrLogo = "";
  let verifyLoadingVisual = `<div class="fidelity-qr-verify-spinner" aria-hidden="true"></div>`;
  if (logoUrl) {
    const fb = typeof logoUrlPublicFallback === "string" ? logoUrlPublicFallback.trim() : "";
    const useFallback =
      fb && fb !== String(logoUrl).trim()
        ? ` data-fid-qr-logo-fallback="${esc(fb)}" onerror="this.onerror=null;var f=this.getAttribute('data-fid-qr-logo-fallback');if(f)this.src=f"`
        : "";
    qrLogo = `<img class="fidelity-qr-logo" src="${esc(logoUrl)}" alt="" width="120" height="120" decoding="async"${useFallback} />`;
    verifyLoadingVisual = `<div class="fidelity-qr-verify-logo-wrap" aria-hidden="true"><img class="fidelity-qr-verify-logo" id="fidelity-qr-verify-logo" src="${esc(logoUrl)}" alt="" width="96" height="96" decoding="async"${useFallback} /></div>`;
  }

  return `
    <main class="fidelity-v2-main fidelity-qr-game">
      <section class="fidelity-qr-hero" aria-label="Jeu">
        <div class="fidelity-qr-brand">
          ${qrLogo || ""}
          <h1 class="${heroTitleClass}">${heroTitleEsc}</h1>
          <p class="fidelity-qr-tagline">${heroTaglineEsc}</p>
        </div>
      </section>

      ${rouletteHtml}
    </main>

    <div id="fidelity-qr-modal-root" class="fidelity-qr-modal-root hidden" aria-hidden="true">
      <div class="fidelity-qr-modal-backdrop" data-fid-qr-close="backdrop"></div>

      <div id="fidelity-qr-panel-google" class="fidelity-qr-modal fidelity-qr-modal--google hidden" role="dialog" aria-modal="true" aria-labelledby="fidelity-qr-google-title">
        <div class="fidelity-qr-modal-g-badge" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
        </div>
        <h2 id="fidelity-qr-google-title" class="fidelity-qr-modal-title">Suivez les étapes</h2>
        <ol class="fidelity-qr-steps">
          <li class="fidelity-qr-step"><span class="fidelity-qr-step-num">1</span><span>Laissez un avis Google</span></li>
          <li class="fidelity-qr-step fidelity-qr-step--accent"><span class="fidelity-qr-step-num">2</span><span>Revenez sur cette page</span></li>
          <li class="fidelity-qr-step"><span class="fidelity-qr-step-num">3</span><span>Faites tourner la roue</span></li>
        </ol>
        <div class="fidelity-qr-stars" aria-hidden="true">★★★★★</div>
        ${
          hasGoogle
            ? `<span class="fidelity-cta-wrap fidelity-cta-wrap--full fidelity-cta-wrap--qr-play fidelity-qr-modal-cta">
            <a class="fidelity-cta-pill fidelity-cta-pill--wheel-cta fidelity-cta-pill--qr-play" id="fidelity-qr-open-google" href="${googleHref}" target="_blank" rel="noopener noreferrer">
              <span class="fidelity-cta-wheel-line fidelity-cta-wheel-line--qr">
                <span class="fidelity-cta-wheel-action">Noter sur Google</span>
                <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
              </span>
            </a>
          </span>`
            : `<span class="fidelity-cta-wrap fidelity-cta-wrap--full fidelity-cta-wrap--qr-play fidelity-qr-modal-cta">
            <button type="button" class="fidelity-cta-pill fidelity-cta-pill--wheel-cta fidelity-cta-pill--qr-play" id="fidelity-qr-skip-google">
              <span class="fidelity-cta-wheel-line fidelity-cta-wheel-line--qr">
                <span class="fidelity-cta-wheel-action">Continuer</span>
                <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
              </span>
            </button>
          </span>`
        }
        <p class="fidelity-qr-modal-hint">Après votre avis, revenez ici : nous débloquons le jeu automatiquement.</p>
      </div>

      <div id="fidelity-qr-panel-verify" class="fidelity-qr-modal fidelity-qr-modal--verify hidden" role="dialog" aria-modal="true" aria-labelledby="fidelity-qr-verify-title">
        <h2 id="fidelity-qr-verify-title" class="fidelity-qr-modal-title">Vérification de votre avis</h2>
        <p class="fidelity-qr-verify-lead">Merci de patienter — cette étape reproduit un contrôle côté serveur et peut prendre quelques secondes.</p>
        <div
          class="fidelity-qr-verify-progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuetext="Vérification en cours"
          id="fidelity-qr-verify-progress"
        >
          <span class="fidelity-qr-verify-progress-bar" id="fidelity-qr-verify-progress-bar"></span>
        </div>
        <p class="fidelity-qr-verify-msg" id="fidelity-qr-verify-text" aria-live="polite">Nous vérifions votre avis Google…</p>
        <div class="fidelity-qr-verify-spinner-wrap">
          ${verifyLoadingVisual}
          <span class="fidelity-qr-verify-spinner-label">Vérification</span>
        </div>
      </div>

      <div id="fidelity-qr-panel-win" class="fidelity-qr-modal fidelity-qr-modal--win hidden" role="dialog" aria-modal="true" aria-labelledby="fidelity-qr-win-title">
        <h2 id="fidelity-qr-win-title" class="fidelity-qr-modal-title">Félicitations !</h2>
        <p class="fidelity-qr-win-prize" id="fidelity-qr-win-prize"></p>
        <button type="button" class="fidelity-qr-btn fidelity-qr-btn--primary" id="fidelity-qr-win-cta">Récupérer mon lot</button>
      </div>

      <div id="fidelity-qr-panel-claim" class="fidelity-qr-modal fidelity-qr-modal--claim hidden" role="dialog" aria-modal="true" aria-labelledby="fidelity-qr-claim-title">
        <h2 id="fidelity-qr-claim-title" class="fidelity-qr-modal-title">Vos coordonnées</h2>
        <p class="fidelity-qr-claim-sub">Pour recevoir votre avantage chez ${businessNameEsc}</p>
        <form id="fidelity-qr-claim-form" class="fidelity-qr-claim-form" novalidate>
          <label class="fidelity-qr-field">
            <span>Prénom</span>
            <input id="fidelity-qr-claim-name" class="fidelity-qr-input" type="text" autocomplete="given-name" required maxlength="100" />
          </label>
          <label class="fidelity-qr-field">
            <span>Email</span>
            <input id="fidelity-qr-claim-email" class="fidelity-qr-input" type="email" autocomplete="email" required maxlength="254" />
          </label>
          <label class="fidelity-qr-check">
            <input id="fidelity-qr-claim-optout" type="checkbox" />
            <span>Je ne souhaite pas recevoir d’offres commerciales par email.</span>
          </label>
          <p id="fidelity-qr-claim-error" class="fidelity-qr-form-error hidden" role="alert"></p>
          <button type="submit" class="fidelity-qr-btn fidelity-qr-btn--primary fidelity-qr-btn--wide" id="fidelity-qr-claim-submit">Valider</button>
        </form>
      </div>
    </div>

    <footer class="fidelity-v2-footer fidelity-v2-footer--dark fidelity-qr-powered">
      <p>Vous êtes un pro ?</p>
    </footer>
  `;
}
