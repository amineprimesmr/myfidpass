/** Markup page /merci — activation compte après paiement Stripe. */
export function getPostPaymentThanksHtml() {
  return `
<div class="post-pay-thanks">
  <div class="post-pay-thanks__card">
    <p class="post-pay-thanks__eyebrow">Paiement confirmé</p>
    <h1 class="post-pay-thanks__title">Merci pour votre achat&nbsp;!</h1>
    <p class="post-pay-thanks__lead" id="post-pay-thanks-lead">
      Votre abonnement est prêt. Choisissez l’e-mail avec lequel vous vous connecterez à l’app commerçant.
    </p>
    <p class="post-pay-thanks__plan hidden" id="post-pay-thanks-plan" aria-live="polite"></p>

    <div class="post-pay-thanks__state post-pay-thanks__state--loading" id="post-pay-thanks-loading">
      <p>Vérification du paiement…</p>
    </div>

    <div class="post-pay-thanks__state hidden" id="post-pay-thanks-error" role="alert">
      <p id="post-pay-thanks-error-text"></p>
      <a href="/" class="post-pay-thanks__link">Retour à l’accueil</a>
    </div>

    <form class="post-pay-thanks__form hidden" id="post-pay-thanks-email-form" novalidate>
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
      <p class="post-pay-thanks__hint">Prérempli avec l’e-mail du paiement — vous pouvez le modifier.</p>
      <button type="submit" class="post-pay-thanks__cta" id="post-pay-thanks-send-code">
        Recevoir mon code de connexion
      </button>
    </form>

    <form class="post-pay-thanks__form hidden" id="post-pay-thanks-code-form" novalidate>
      <p class="post-pay-thanks__code-intro">
        Un code à 6 chiffres a été envoyé à <strong id="post-pay-thanks-email-display"></strong>.
      </p>
      <label class="post-pay-thanks__label" for="post-pay-thanks-code">Code de vérification</label>
      <input
        id="post-pay-thanks-code"
        class="post-pay-thanks__input post-pay-thanks__input--code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        pattern="[0-9]{6}"
        required
        placeholder="123456"
      />
      <button type="submit" class="post-pay-thanks__cta" id="post-pay-thanks-verify">
        Activer mon compte
      </button>
      <button type="button" class="post-pay-thanks__ghost" id="post-pay-thanks-back-email">
        Changer d’e-mail
      </button>
    </form>

    <div class="post-pay-thanks__state hidden" id="post-pay-thanks-done">
      <p class="post-pay-thanks__success">Compte activé — redirection vers votre espace…</p>
      <a href="/app" class="post-pay-thanks__cta post-pay-thanks__cta--secondary">Ouvrir l’espace commerçant</a>
      <a href="/get" class="post-pay-thanks__link">Télécharger l’app mobile</a>
    </div>
  </div>
</div>`;
}
