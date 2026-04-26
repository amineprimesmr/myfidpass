import "./fintap-landing.css";
import { FinTapFeatureSections } from "./FinTapFeatureSections.jsx";
import { FinTapFooterSection } from "./FinTapFooterSection.jsx";
import { FinTapHeroScrollSection } from "./FinTapHeroScrollSection.jsx";
import { FinTapIntegrationsSection } from "./FinTapIntegrationsSection.jsx";
import { FinTapSecurityCtaSection } from "./FinTapSecurityCtaSection.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";

/**
 * Parcours FinTap (réf. fintap.framer.website) : hero scroll iPhone, puis sections produit.
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
