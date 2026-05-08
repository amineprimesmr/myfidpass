/**
 * Page statique /contact — assistance commerçants & clients.
 */

export function getContactPageHtml() {
  return `
<article class="contact-page" lang="fr">
  <header class="contact-page__hero">
    <p class="contact-page__eyebrow">MyFidPass</p>
    <h1>Nous contacter</h1>
    <p class="contact-page__lead">
      Une question sur votre <strong>carte fidélité</strong>, votre <strong>compte commerçant</strong>, Apple&nbsp;Wallet ou Google&nbsp;Wallet ?
      Choisissez le canal qui vous convient — nous répondons en général sous <strong>1 jour ouvré</strong>.
    </p>
  </header>

  <div class="contact-page__grid" role="list">
    <section class="contact-card" role="listitem">
      <div class="contact-card__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>
      </div>
      <h2 class="contact-card__title">Écrire</h2>
      <p class="contact-card__text">Idéal pour les demandes détaillées ou les captures d’écran.</p>
      <a class="contact-card__cta" href="mailto:contact@myfidpass.fr">contact@myfidpass.fr</a>
    </section>

    <section class="contact-card" role="listitem">
      <div class="contact-card__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </div>
      <h2 class="contact-card__title">Appeler</h2>
      <p class="contact-card__text">Support téléphonique (France). Coût d’un appel local depuis un fixe.</p>
      <a class="contact-card__cta" href="tel:+33805980685">0&nbsp;805&nbsp;98&nbsp;06&nbsp;85</a>
    </section>

    <section class="contact-card contact-card--accent" role="listitem">
      <div class="contact-card__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      </div>
      <h2 class="contact-card__title">Horaires</h2>
      <p class="contact-card__text"><strong>Lundi → vendredi</strong>, 9h–18h (heure de Paris).</p>
      <p class="contact-card__hint">En dehors de ces créneaux, privilégiez l’e-mail : nous traitons les demandes dans l’ordre d’arrivée.</p>
    </section>
  </div>

  <section class="contact-page__form-block" aria-labelledby="contact-form-title">
    <h2 id="contact-form-title">Envoyer un message</h2>
    <p class="contact-page__form-desc">Le bouton ouvre votre application mail avec le texte déjà prêt.</p>
    <form id="contact-page-form" class="contact-form" novalidate>
      <div class="contact-form__row">
        <label class="contact-form__label" for="contact-page-name">Nom (facultatif)</label>
        <input class="contact-form__input" id="contact-page-name" name="name" type="text" autocomplete="name" placeholder="Votre nom ou celui du commerce" />
      </div>
      <div class="contact-form__row">
        <label class="contact-form__label" for="contact-page-email">E-mail de réponse</label>
        <input class="contact-form__input" id="contact-page-email" name="email" type="email" autocomplete="email" required placeholder="vous@exemple.fr" />
      </div>
      <div class="contact-form__row">
        <label class="contact-form__label" for="contact-page-topic">Sujet</label>
        <select class="contact-form__select" id="contact-page-topic" name="topic">
          <option value="commerce">Je suis commerçant — question technique ou facturation</option>
          <option value="client">Je suis client — carte Wallet, QR code ou points</option>
          <option value="partenariat">Partenariat ou presse</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      <div class="contact-form__row">
        <label class="contact-form__label" for="contact-page-message">Message</label>
        <textarea class="contact-form__textarea" id="contact-page-message" name="message" required rows="5" placeholder="Décrivez votre demande (captures d’écran utiles en pièce jointe après ouverture du mail)."></textarea>
      </div>
      <p id="contact-page-form-error" class="contact-form__error hidden" role="alert"></p>
      <button type="submit" class="contact-form__submit">Ouvrir dans ma messagerie</button>
    </form>
  </section>

  <div class="contact-page__audience">
    <section class="contact-audience-card">
      <h2>Vous êtes commerçant</h2>
      <p>Aide pour créer votre carte, connecter Google&nbsp;Business, campagnes ou abonnement.</p>
      <a class="contact-audience-card__link" href="/creer-ma-carte">Créer ou accéder à mon espace →</a>
    </section>
    <section class="contact-audience-card contact-audience-card--muted">
      <h2>Vous êtes client</h2>
      <p>Problème avec la carte d’un magasin : indiquez le <strong>nom du commerce</strong> dans votre message.</p>
      <p class="contact-audience-card__note">MyFidPass fournit la technologie au commerce ; chaque enseigne gère ses offres.</p>
    </section>
  </div>

  <nav class="landing-legal-nav contact-page__nav" aria-label="Pages liées">
    <a href="/mentions-legales">Mentions légales</a>
    <a href="/politique-confidentialité">Politique de confidentialité</a>
    <a href="/cgu">CGU</a>
    <a href="/">Retour à l’accueil</a>
  </nav>
</article>
`.trim();
}
