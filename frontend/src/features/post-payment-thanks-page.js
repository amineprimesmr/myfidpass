/** Markup page /merci — 2 étapes : formulaire puis téléchargement app. */
export function getPostPaymentThanksHtml() {
  return `
<div class="post-pay-thanks">
  <div class="post-pay-thanks__bg" aria-hidden="true"></div>
  <div class="post-pay-thanks__shell">

    <div class="post-pay-thanks__state post-pay-thanks__state--loading" id="post-pay-thanks-loading">
      <div class="post-pay-thanks__spinner" aria-hidden="true"></div>
      <p>Vérification du paiement…</p>
    </div>

    <div class="post-pay-thanks__state hidden" id="post-pay-thanks-error" role="alert">
      <p class="post-pay-thanks__error-title">Une erreur est survenue</p>
      <p id="post-pay-thanks-error-text" class="post-pay-thanks__error-text"></p>
      <a href="/" class="post-pay-thanks__link-btn">Retour à l’accueil</a>
    </div>

    <!-- Étape 1 : commerce + e-mail -->
    <div class="post-pay-thanks__step hidden" id="post-pay-step-form">
      <img src="/assets/icone.png?v=20260416" alt="" class="post-pay-thanks__logo" width="72" height="72" decoding="async" />
      <div class="post-pay-thanks__card">
        <div class="post-pay-thanks__badge" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 10.5L8 14.5L16 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h1 class="post-pay-thanks__title">Paiement confirmé</h1>
        <p class="post-pay-thanks__lead" id="post-pay-thanks-lead">
          Indiquez votre commerce et votre e-mail pour activer votre compte.
        </p>

        <form class="post-pay-thanks__form" id="post-pay-thanks-setup-form" novalidate>
          <div class="post-pay-thanks__field" id="post-pay-commerce-field">
            <label class="post-pay-thanks__label" for="post-pay-commerce">Nom du commerce</label>
            <div class="post-pay-thanks__input-wrap" id="post-pay-commerce-wrap">
              <input
                id="post-pay-commerce"
                class="post-pay-thanks__input"
                type="text"
                name="commerce"
                autocomplete="organization"
                required
                placeholder="Rechercher votre établissement…"
              />
              <input type="hidden" id="post-pay-place-id" name="google_place_id" value="" />
            </div>
            <p class="post-pay-thanks__hint">Sélectionnez votre commerce dans la liste Google.</p>
            <p class="post-pay-thanks__conflict hidden" id="post-pay-commerce-conflict" role="alert"></p>
          </div>

          <div class="post-pay-thanks__field">
            <label class="post-pay-thanks__label" for="post-pay-thanks-email">E-mail de connexion</label>
            <input
              id="post-pay-thanks-email"
              class="post-pay-thanks__input"
              type="email"
              name="email"
              autocomplete="email"
              inputmode="email"
              required
              placeholder="vous@exemple.com"
            />
          </div>

          <button type="submit" class="post-pay-thanks__cta" id="post-pay-thanks-send-link">
            Valider mon e-mail
          </button>
        </form>
      </div>
    </div>

    <!-- Étape 2 : e-mail envoyé + téléchargement app -->
    <div class="post-pay-thanks__step post-pay-thanks__step--download hidden" id="post-pay-step-download">
      <img src="/assets/icone.png?v=20260416" alt="Myfidpass" class="post-pay-thanks__logo post-pay-thanks__logo--large" width="120" height="120" decoding="async" />
      <div class="post-pay-thanks__download-hero">
        <h1 class="post-pay-thanks__download-title">Fidélisez vos clients.</h1>
        <p class="post-pay-thanks__download-sub">
          Un e-mail a été envoyé à <strong id="post-pay-email-sent-to"></strong>.
          Cliquez le lien pour activer votre compte, ou téléchargez l’app maintenant.
        </p>
      </div>

      <div class="post-pay-thanks__download">
        <div id="post-pay-qr-container" class="post-pay-thanks__qr-container hidden">
          <div id="post-pay-qr" class="post-pay-thanks__qr"></div>
        </div>
        <div class="post-pay-thanks__store-buttons">
          <button type="button" id="post-pay-store-ios" class="post-pay-thanks__store-btn" aria-label="Télécharger sur l’App Store">
            <img src="/assets/get/app_store_white.svg" alt="App Store" width="120" height="40" decoding="async" />
          </button>
          <button type="button" id="post-pay-store-android" class="post-pay-thanks__store-btn" aria-label="Disponible sur Google Play">
            <img src="/assets/get/google_play.png" alt="Google Play" width="135" height="40" decoding="async" />
          </button>
        </div>
      </div>

      <div class="post-pay-thanks__download-actions">
        <button type="button" class="post-pay-thanks__ghost" id="post-pay-thanks-resend">Renvoyer l’e-mail</button>
        <button type="button" class="post-pay-thanks__ghost" id="post-pay-thanks-back-setup">Modifier mes informations</button>
      </div>
    </div>
  </div>
</div>`;
}
