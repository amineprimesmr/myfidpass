import "./fintap-landing.css";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";
import { FinTapContentCarouselSection } from "./FinTapContentCarouselSection.jsx";
import { FinTapFeaturesGridSection } from "./FinTapFeaturesGridSection.jsx";
import { FinTapRevenueSimulatorSection } from "./FinTapRevenueSimulatorSection.jsx";
import { FinTapStepsScrollSection } from "./FinTapStepsScrollSection.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";
import { FinTapPricingSection } from "./FinTapPricingSection.jsx";

/**
 * Landing cinéma : hero, grille fonctionnalités, étapes scroll, témoignages. Footer global #landing.
 */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapHeroScrollSection />
      <FinTapContentCarouselSection />
      <FinTapFeaturesGridSection />
      <FinTapStepsScrollSection />
      <FinTapRevenueSimulatorSection />
      <FinTapTestimonialsSection />
      <FinTapPricingSection />
    </main>
  );
}
