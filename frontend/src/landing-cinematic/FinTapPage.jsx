import "./fintap-landing.css";
import { FinTapFeatureSections } from "./FinTapFeatureSections.jsx";
import { FinTapFooterSection } from "./FinTapFooterSection.jsx";
import { FinTapIntegrationsSection } from "./FinTapIntegrationsSection.jsx";
import { FinTapSecurityCtaSection } from "./FinTapSecurityCtaSection.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";

/**
 * Parcours FinTap (réf. fintap.framer.website) : sections produit, etc. (hero scroll supprimé — refonte à venir).
 */
export function FinTapPage() {
  return (
    <main className="fintap-landing" id="fintap-main" role="main">
      <FinTapFeatureSections />
      <FinTapTestimonialsSection />
      <FinTapIntegrationsSection />
      <FinTapSecurityCtaSection />
      <FinTapFooterSection />
    </main>
  );
}
