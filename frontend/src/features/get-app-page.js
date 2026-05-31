/** Markup clone get.tuyo.com — classes identiques pour le CSS partagé. */
export function getGetAppPageHtml() {
  return `
<div class="container get-app-container">
  <img height="200" src="/assets/icone.png?v=20260416" alt="Myfidpass" class="get-app-logo" decoding="async" />
  <div class="color-foreground">
    <div class="content">
      <h2 id="get-app-title" class="title">Fidélisez vos clients.</h2>
      <p id="get-app-subtitle" class="color-foreground-secondary subtitle">Uniquement sur Myfidpass. Téléchargez maintenant.</p>
      <p id="get-app-referral" class="referral-code hidden" aria-hidden="true"></p>
    </div>
    <div id="get-app-qr-container" class="qr-container hidden">
      <div id="get-app-qr" class="qr-code"></div>
    </div>
    <div class="two-buttons">
      <button type="button" id="get-app-store-ios" class="get-app-store-btn" aria-label="Télécharger sur l&apos;App Store">
        <img class="store-logo" src="/assets/get/app_store_white.svg" alt="App Store" width="120" height="40" decoding="async" />
      </button>
      <button type="button" id="get-app-store-android" class="get-app-store-btn" aria-label="Disponible sur Google Play">
        <img class="store-logo" src="/assets/get/google_play.png" alt="Google Play" width="135" height="40" decoding="async" />
      </button>
    </div>
  </div>
</div>`;
}
