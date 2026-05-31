const BRAND_ICON = "/assets/icone.png?v=20260416";

/** Logo Myfidpass — affiché en haut du hero cinéma sur mobile (icône seule). */
export function FinTapHeroMobileLogo() {
  return (
    <a href="/" className="fintap-hero-iphone__brand" aria-label="Myfidpass — Accueil">
      <img
        className="fintap-hero-iphone__brand-icon"
        src={BRAND_ICON}
        alt="Myfidpass"
        width={40}
        height={40}
        decoding="async"
        draggable={false}
      />
    </a>
  );
}
