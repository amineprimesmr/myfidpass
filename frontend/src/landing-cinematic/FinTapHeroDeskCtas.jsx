import { useLayoutEffect } from "react";
import { updateAuthNavLinks } from "../router/index.js";
import "./fintap-hero-desk-ctas.css";

const IOS_APP_DEFAULT = "6759921605";

function iosAppStoreUrl() {
  const raw =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_IOS_APP_STORE_ID : "";
  const id = String(raw || "").trim() || IOS_APP_DEFAULT;
  return `https://apps.apple.com/fr/app/id${id}`;
}

/**
 * Boutons hero (mobile + desktop) : dans le panneau bleu, scrollent avec le hero (pas fixed).
 */
export function FinTapHeroDeskCtas() {
  useLayoutEffect(() => {
    updateAuthNavLinks();
  }, []);

  return (
    <div className="fintap-hero-desk-ctas">
      <a
        className="fintap-hero-desk-cta fintap-hero-desk-cta--app"
        href={iosAppStoreUrl()}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          className="fintap-hero-desk-cta__icon fintap-hero-desk-cta__icon--apple"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
          />
        </svg>
        <span className="fintap-hero-desk-cta__label">télécharger l&apos;app</span>
      </a>
      <a
        className="fintap-hero-desk-cta fintap-hero-desk-cta--login landing-nav-login-link"
        href="/creer-ma-carte?mode=login&redirect=/app"
      >
        <span className="fintap-hero-desk-cta__label">se connecter</span>
      </a>
    </div>
  );
}
