import { FinTapVarCardsSection } from "./FinTapVarCardsSection.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";
import "./fintap-features-grid.css";

/** Section fonctionnalités — carousel var1–3 (mobile et desktop). */
export function FinTapFeaturesGridSection() {
  return (
    <section
      className="fintap-features-grid"
      id="fonctionnalites"
      aria-labelledby="fintap-features-grid-heading"
    >
      <div className="fintap-section-inner fintap-features-grid__inner">
        <header className="fintap-features-grid__header">
          <ScrollReveal>
            <h2 id="fintap-features-grid-heading" className="fintap-steps-scroll__h2">
              Tout ce qu&apos;il faut pour fidéliser et vendre plus
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="fintap-steps-scroll__intro fintap-features-grid__intro">
              100% automatisé, pensé pour vous faire gagner du temps et garder vos clients engagés.
            </p>
          </ScrollReveal>
        </header>

        <FinTapVarCardsSection embedded />

        <div className="fintap-features-grid__cta-wrap">
          <ScrollReveal delay={0.08}>
            <a href="/get" className="fintap-features-grid__cta">
              Télécharger l&apos;app
            </a>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
