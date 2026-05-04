import "./fintap-landing.css";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";
import { FinTapFeaturesGridSection } from "./FinTapFeaturesGridSection.jsx";
import { FinTapStepsScrollSection } from "./FinTapStepsScrollSection.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";
import { FinTapSecurityCtaSection } from "./FinTapSecurityCtaSection.jsx";

/**
 * Landing cinéma : hero, étapes scroll, témoignages, sécurité + CTA. Footer global #landing.
 */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapHeroScrollSection />
      <FinTapFeaturesGridSection />
      <FinTapStepsScrollSection />
      <FinTapTestimonialsSection />
      <FinTapSecurityCtaSection />
    </main>
  );
}
