import "./fintap-landing.css";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";

/**
 * Accueil : hero (scroll iPhone) seul ; le pied de page site est le footer #landing.
 */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapHeroScrollSection />
    </main>
  );
}
