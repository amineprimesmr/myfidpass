import { ScrollReveal } from "./ScrollReveal.jsx";
import { FINTAP_PRICING_FEATURES, FINTAP_PRICING_PLANS } from "./fintap-pricing-data.js";
import { getLandingPricingCheckoutUrl } from "./fintap-pricing-urls.js";
import "./fintap-pricing.css";

/** Section tarification — 1er mois à 1 €, puis mensuel ou annuel. */
export function FinTapPricingSection() {
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
              <span className="fintap-pricing__title-accent">1&nbsp;€</span>, puis…
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <p className="fintap-pricing__intro">
              Lancez votre programme de fidélité dès aujourd&apos;hui. Choisissez l&apos;offre
              mensuelle flexible ou l&apos;abonnement annuel à 399&nbsp;€/an.
            </p>
          </ScrollReveal>
        </header>

        <ul className="fintap-pricing__grid">
          {FINTAP_PRICING_PLANS.map((plan, idx) => (
            <ScrollReveal
              key={plan.id}
              tag="li"
              className={
                "fintap-pricing__card" +
                (plan.featured ? " fintap-pricing__card--featured" : "")
              }
              variant="scale-up"
              delay={0.06 * idx}
            >
              {plan.badge ? (
                <span className="fintap-pricing__badge">{plan.badge}</span>
              ) : null}
              <p className="fintap-pricing__plan-name">{plan.name}</p>
              <p className="fintap-pricing__price-row">
                <span className="fintap-pricing__price">{plan.price}</span>
                <span className="fintap-pricing__period">{plan.period}</span>
              </p>
              <p className="fintap-pricing__summary">{plan.summary}</p>
              <p className="fintap-pricing__detail">{plan.detail}</p>
              <ul className="fintap-pricing__features">
                {FINTAP_PRICING_FEATURES.map((feature) => (
                  <li key={`${plan.id}-${feature}`}>{feature}</li>
                ))}
              </ul>
              <a
                href={getLandingPricingCheckoutUrl(plan.id)}
                className="fintap-pricing__cta"
                target="_blank"
                rel="noopener noreferrer"
              >
                {plan.cta}
              </a>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
