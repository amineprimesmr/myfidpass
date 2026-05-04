import "./fintap-landing.css";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";
import { FinTapFeaturesGridSection } from "./FinTapFeaturesGridSection.jsx";
import { FinTapStepsScrollSection } from "./FinTapStepsScrollSection.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";

/**
 * Landing cinéma : hero, grille fonctionnalités, étapes scroll, témoignages. Footer global #landing.
 */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapHeroScrollSection />
      <FinTapFeaturesGridSection />
      <FinTapStepsScrollSection />
      <FinTapTestimonialsSection />
    </main>
  );
}
