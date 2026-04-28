import "./fintap-landing.css";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";
import { FinTapFeatureSections } from "./FinTapFeatureSections.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";
import { FinTapIntegrationsSection } from "./FinTapIntegrationsSection.jsx";
import { FinTapSecurityCtaSection } from "./FinTapSecurityCtaSection.jsx";
import { FinTapFooterSection } from "./FinTapFooterSection.jsx";

/**
 * Accueil : hero (scroll iPhone) seul ; le pied de page site est le footer #landing.
 */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapHeroScrollSection />
      <FinTapFeatureSections />
      <FinTapTestimonialsSection />
      <FinTapIntegrationsSection />
      <FinTapSecurityCtaSection />
      <FinTapFooterSection />
    </main>
  );
}
