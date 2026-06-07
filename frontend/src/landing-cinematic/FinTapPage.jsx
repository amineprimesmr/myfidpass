import "./fintap-landing.css";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";
import { FinTapContentCarouselSection } from "./FinTapContentCarouselSection.jsx";
import { FinTapFeaturesGridSection } from "./FinTapFeaturesGridSection.jsx";
import { FinTapRevenueSimulatorSection } from "./FinTapRevenueSimulatorSection.jsx";
import { FinTapStepsScrollSection } from "./FinTapStepsScrollSection.jsx";

/** Landing cinéma : hero, carrousel, fonctionnalités, étapes, simulateur ROI. Footer global #landing. */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapHeroScrollSection />
      <FinTapContentCarouselSection />
      <FinTapFeaturesGridSection />
      <FinTapStepsScrollSection />
      <FinTapRevenueSimulatorSection />
    </main>
  );
}
