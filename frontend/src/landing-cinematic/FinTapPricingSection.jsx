import { ScrollReveal } from "./ScrollReveal.jsx";
import { FINTAP_PRICING_FEATURES, FINTAP_PRICING_PLAN } from "./fintap-pricing-data.js";
import { getLandingPricingCheckoutUrl } from "./fintap-pricing-urls.js";
import "./fintap-pricing.css";

/** Section tarification — offre unique : 1er mois à 1 €, puis 49 €/mois. */
export function FinTapPricingSection() {
  const plan = FINTAP_PRICING_PLAN;

  return (
    <section
      className="fintap-pricing"
      id="tarifs"
      aria-labelledby="fintap-pricing-heading"
    >
      <div className="fintap-section-inner fintap-pricing__inner">
        <header className="fintap-pricing__header">
          <ScrollReveal>
            <p className="fintap-pricing__eyebrow">Tarification</p>
            <h2 id="fintap-pricing-heading" className="fintap-pricing__title">
              Premier mois à{" "}
              <span className="fintap-pricing__title-accent">{plan.trialPrice}</span>
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <p className="fintap-pricing__intro">
              Lancez votre programme de fidélité dès aujourd&apos;hui.{" "}
              <strong>Puis {plan.price}{plan.period}</strong>, sans engagement.
            </p>
          </ScrollReveal>
        </header>

        <ScrollReveal delay={0.1} variant="scale-up">
          <article className="fintap-pricing__offer">
            <span className="fintap-pricing__badge">{plan.badge}</span>

            <div className="fintap-pricing__trial">
              <span className="fintap-pricing__trial-price">{plan.trialPrice}</span>
              <span className="fintap-pricing__trial-label">{plan.trialLabel}</span>
            </div>

            <p className="fintap-pricing__then">
              puis{" "}
              <span className="fintap-pricing__price">
                {plan.price}
                <span className="fintap-pricing__period">{plan.period}</span>
              </span>
            </p>

            <p className="fintap-pricing__summary">{plan.summary}</p>
            <p className="fintap-pricing__detail">{plan.detail}</p>

            <ul className="fintap-pricing__features">
              {FINTAP_PRICING_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            <a
              href={getLandingPricingCheckoutUrl()}
              className="fintap-pricing__cta"
              target="_blank"
              rel="noopener noreferrer"
            >
              {plan.cta}
            </a>
          </article>
        </ScrollReveal>
      </div>
    </section>
  );
}
