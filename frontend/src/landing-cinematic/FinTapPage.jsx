import "./fintap-landing.css";
import { FinTapFeatureSections } from "./FinTapFeatureSections.jsx";
import { FinTapFooterSection } from "./FinTapFooterSection.jsx";
import { FinTapIntegrationsSection } from "./FinTapIntegrationsSection.jsx";
import { FinTapSecurityCtaSection } from "./FinTapSecurityCtaSection.jsx";
import { FinTapTestimonialsSection } from "./FinTapTestimonialsSection.jsx";
import { PhoneScrollSection } from "./PhoneScrollSection.jsx";

/**
 * Parcours FinTap (réf. fintap.framer.website) : hero / sticky 3D + toutes les sections.
 */
export function FinTapPage() {
  return (
    <div className="fintap-landing">
      <PhoneScrollSection />
      <FinTapFeatureSections />
      <FinTapTestimonialsSection />
      <FinTapIntegrationsSection />
      <FinTapSecurityCtaSection />
      <FinTapFooterSection />
    </div>
  );
}
