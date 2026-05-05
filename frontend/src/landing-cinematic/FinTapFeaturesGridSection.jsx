import { fintapFeaturesGridItems } from "./fintap-features-data.js";
import { FinTapEngagementMetricsVisual } from "./FinTapEngagementMetricsVisual.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";
import "./fintap-features-grid.css";

/**
 * Grille 2×2 type « feature cards » (fond gris clair, cartes blanches arrondies).
 */
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
              Tout ce qu'il faut pour fidéliser et vendre plus
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="fintap-steps-scroll__intro fintap-features-grid__intro">
            100% automatisé, pensé pour vous faire gagner du temps et garder vos clients engagés.
            </p>
          </ScrollReveal>
        </header>

        <ul className="fintap-features-grid__list">
          {fintapFeaturesGridItems.map((item, idx) => (
            <ScrollReveal
              key={item.id}
              tag="li"
              className="fintap-features-grid__card"
              variant="scale-up"
              delay={0.07 * idx}
            >
              <div
                className={
                  "fintap-features-grid__visual" +
                  (item.imageFadeBottom ? " fintap-features-grid__visual--fade-bottom" : "") +
                  (item.visualKind === "engagement" ? " fintap-features-grid__visual--engagement" : "") +
                  (item.id === "reputation" ? " fintap-features-grid__visual--flush-x" : "")
                }
                {...(item.visualKind !== "engagement" ? { "aria-hidden": true } : {})}
              >
                {item.visualKind === "engagement" ? (
                  <FinTapEngagementMetricsVisual />
                ) : (
                  <img
                    className={
                      "fintap-features-grid__img" + (item.id === "reputation" ? " fintap-features-grid__img--flush-x" : "")
                    }
                    src={item.imageSrc}
                    alt=""
                    width={560}
                    height={360}
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
              <div className="fintap-features-grid__copy">
                <h3 className="fintap-features-grid__card-title">{item.title}</h3>
                <p className="fintap-features-grid__card-desc">{item.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
