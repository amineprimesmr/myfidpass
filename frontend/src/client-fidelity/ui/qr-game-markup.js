/**
 * Parcours QR : roue en premier, modales Google → vérif → gain → inscription (prénom + email).
 */

import { renderPoweredByMyfidpassMarkup } from "./powered-by-markup.js";

/**
 * @param {string} titleEsc
 * @returns {string}
 */
function renderQrLeadTitleMarkup(titleEsc) {
  const title = String(titleEsc || "").trim().replace(/\.$/, "");
  const words = title.split(/\s+/).filter(Boolean);
  let line1 = "";
  let line2 = "";
  let pill = "";
  /** Fragment HTML statique (phrase d’accroche par défaut : emphase partielle). */
  let line1Html = "";
  /** @type {string} */
  let line1Class = "fidelity-qr-title-line--soft";

  if (/^participez au jeu et tentez de gagner une récompense$/i.test(title)) {
    /* 2 lignes visuelles : une ligne de texte + pilule ; seuls « tentez de gagner » en gras. */
    line1Html =
      '<span class="fidelity-qr-title-line__part">PARTICIPEZ AU JEU ET </span>' +
      '<strong class="fidelity-qr-title-line__emph">TENTEZ DE GAGNER</strong>' +
      '<span class="fidelity-qr-title-line__part"> UNE</span>';
    line2 = "";
    pill = "RECOMPENSE";
    line1Class = "fidelity-qr-title-line--lead-single";
  } else if (words.length >= 5) {
    pill = String(words.pop() || "").toUpperCase();
    const cut = Math.max(2, Math.ceil(words.length * 0.55));
    line1 = words.slice(0, cut).join(" ").toUpperCase();
    line2 = words.slice(cut).join(" ").toUpperCase();
  } else {
    line1 = words.slice(0, -1).join(" ").toUpperCase();
    pill = String(words.at(-1) || title).toUpperCase();
  }

  const layoutClass = line1Html
    ? "fidelity-qr-title-layout fidelity-qr-title-layout--default-phrase"
    : "fidelity-qr-title-layout";

  return `<span class="${layoutClass}">
    ${
      line1Html
        ? `<span class="fidelity-qr-title-line ${line1Class}">${line1Html}</span>`
        : line1
          ? `<span class="fidelity-qr-title-line ${line1Class}">${line1}</span>`
          : ""
    }
    ${line2 ? `<span class="fidelity-qr-title-line fidelity-qr-title-line--strong">${line2}</span>` : ""}
    <span class="fidelity-qr-title-pill-wrap">
      <span class="fidelity-qr-title-pill">${pill}</span>
    </span>
  </span>`;
}

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
    qrThanksHeroMode = false,
  } = p;
  /* Un seul titre sous l’icône : accroche jeu (ou « Merci… » après Google) — pas le nom du commerce */
  const heroTitleEsc = qrThanksHeroMode ? esc("Merci, bonne chance !") : businessTaglineEsc;
  const heroTitleClass = qrThanksHeroMode
    ? "fidelity-qr-title fidelity-qr-title--thanks"
    : "fidelity-qr-title fidelity-qr-title--lead";
  const heroSuccessClass = qrThanksHeroMode ? " fidelity-qr-hero-success--visible" : "";

  const hasGoogle = Boolean(googleReviewUrl);
  const googleHref = hasGoogle ? String(googleReviewUrl).replace(/"/g, "&quot;") : "";
  const verifyFallbackSrcEsc = esc("/assets/chargement.png");

  let qrLogo = "";
  let verifyLoadingVisual = `<div class="fidelity-qr-verify-logo-wrap fidelity-qr-verify-logo-wrap--placeholder" aria-hidden="true"><img class="fidelity-qr-verify-logo fidelity-qr-verify-logo--placeholder" id="fidelity-qr-verify-logo" src="${verifyFallbackSrcEsc}" alt="" width="96" height="96" decoding="async" /></div>`;
  if (logoUrl) {
    const logoOnErr =
      'this.onerror=null;this.classList.add("fidelity-qr-logo--hidden");this.removeAttribute("src")';
    const verifyOnErr =
      `this.onerror=null;this.src="${verifyFallbackSrcEsc}";this.classList.add("fidelity-qr-verify-logo--placeholder");if(this.parentNode&&this.parentNode.classList){this.parentNode.classList.add("fidelity-qr-verify-logo-wrap--placeholder");}`;
    qrLogo = `<img class="fidelity-qr-logo" src="${esc(logoUrl)}" alt="${businessNameEsc}" decoding="async" onerror="${logoOnErr}" />`;
    verifyLoadingVisual = `<div class="fidelity-qr-verify-logo-wrap" aria-hidden="true"><img class="fidelity-qr-verify-logo" id="fidelity-qr-verify-logo" src="${esc(logoUrl)}" alt="" width="96" height="96" decoding="async" onerror="${verifyOnErr}" /></div>`;
  }

  return `
    <main class="fidelity-v2-main fidelity-qr-game">
      <section class="fidelity-qr-hero" aria-label="Jeu">
        <div class="fidelity-qr-brand">
          <div class="fidelity-qr-hero-orb fidelity-qr-hero-orb--top" aria-hidden="true"></div>
          <div class="fidelity-qr-hero-orb fidelity-qr-hero-orb--bottom" aria-hidden="true"></div>
          ${qrLogo || ""}
          <div class="fidelity-qr-hero-decor">
            <span class="fidelity-qr-hero-decor-chip fidelity-qr-hero-decor-chip--spark" aria-hidden="true">+</span>
            <img
              id="fidelity-qr-mysterybox"
              class="fidelity-qr-hero-decor-chip fidelity-qr-hero-decor-chip--mysterybox"
              src="/assets/mysterybox.png?v=20260416d"
              alt=""
              width="112"
              height="112"
              decoding="async"
              draggable="false"
              role="button"
              tabindex="0"
              aria-pressed="false"
              aria-label="Boîte mystère : lancer ou arrêter l’animation"
            />
            <span class="fidelity-qr-hero-decor-chip fidelity-qr-hero-decor-chip--mini" aria-hidden="true"></span>
          </div>
          <h1 class="${heroTitleClass}" id="fidelity-qr-hero-title">
            <span class="fidelity-qr-hero-title-inner">${qrThanksHeroMode ? heroTitleEsc : renderQrLeadTitleMarkup(heroTitleEsc)}</span>
          </h1>
          <p id="fidelity-qr-hero-success" class="fidelity-qr-hero-success${heroSuccessClass}" role="status" aria-live="polite">
            <span class="fidelity-qr-hero-success-check" aria-hidden="true">✓</span>
            <span>Avis enregistré — tu peux lancer la roue.</span>
          </p>
        </div>
      </section>

      ${rouletteHtml}
    </main>

    ${renderPoweredByMyfidpassMarkup(esc, "fidelity-qr-powered")}

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

      <div id="fidelity-qr-panel-reward" class="fidelity-qr-modal fidelity-qr-modal--reward hidden" role="dialog" aria-modal="true" aria-labelledby="fidelity-qr-reward-title" data-reward-state="win">
        <div class="fidelity-qr-reward-hero" aria-hidden="true">
          <div class="fidelity-qr-reward-hero__glow"></div>
          <div class="fidelity-qr-reward-hero__ring"></div>
          <div class="fidelity-qr-reward-hero__sparkles">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="fidelity-qr-reward-hero__medal" role="presentation">
            <span class="fidelity-qr-reward-hero__medal-inner">★</span>
          </div>
        </div>
        <h2 id="fidelity-qr-reward-title" class="fidelity-qr-modal-title fidelity-qr-modal-title--reward">Félicitations !</h2>
        <div id="fidelity-qr-reward-prize" class="fidelity-qr-reward-prize hidden" aria-live="polite"></div>
        <p id="fidelity-qr-reward-lead" class="fidelity-qr-reward-lead" role="status">Ta récompense est prête.</p>
        <p class="fidelity-qr-reward-form-intro">Pour l’ajouter à ta carte fidélité, complète tes infos :</p>
        <form id="fidelity-qr-claim-form" class="fidelity-qr-claim-form" novalidate>
          <label class="fidelity-qr-field">
            <span>Prénom</span>
            <input id="fidelity-qr-claim-name" class="fidelity-qr-input" type="text" autocomplete="given-name" required maxlength="100" />
          </label>
          <label class="fidelity-qr-field">
            <span>Email</span>
            <input id="fidelity-qr-claim-email" class="fidelity-qr-input" type="email" autocomplete="email" required maxlength="254" />
          </label>
          <p id="fidelity-qr-claim-error" class="fidelity-qr-form-error hidden" role="alert"></p>
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full fidelity-cta-wrap--qr-play fidelity-qr-modal-cta fidelity-qr-claim-cta-wrap">
            <button
              type="submit"
              class="fidelity-shiny-cta fidelity-shiny-cta--missions-gift fidelity-shiny-cta--qr-play"
              id="fidelity-qr-claim-submit"
            >
              <span class="fidelity-shiny-cta__label"><span>Recevoir ma récompense</span></span>
            </button>
          </span>
        </form>
      </div>
    </div>

  `;
}
