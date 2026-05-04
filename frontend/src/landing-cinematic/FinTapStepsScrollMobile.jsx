import { FINTAP_STEPS } from "./fintap-steps-data.js";
import { StepVisualByIndex } from "./FinTapStepsScrollVisuals.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapStepsScrollMobile() {
  return (
    <div className="fintap-steps-scroll__mobile">
      <ScrollReveal>
        <h2 id="fintap-steps-heading" className="fintap-steps-scroll__h2">
          Lancez-vous en 3 étapes simples.
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={0.1}>
        <p className="fintap-steps-scroll__intro">
          Du commerce à la carte Wallet : tout est pensé pour vous faire gagner du temps et garder vos clients engagés.
        </p>
      </ScrollReveal>
      <ol className="fintap-steps-mobile__list">
        {FINTAP_STEPS.map((step, i) => (
          <ScrollReveal
            key={step.cardTitle}
            tag="li"
            className="fintap-steps-mobile__step"
            variant="scale-up"
            delay={0.1 * i}
          >
            <div className="fintap-steps-card__grey-panel fintap-steps-mobile__grey-panel">
              <span className="fintap-steps-card__footer-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="fintap-steps-card__grey-panel-media">
                <StepVisualByIndex index={i} />
              </div>
              <h4 className="fintap-steps-card__title fintap-steps-mobile__card-title">{step.cardTitle}</h4>
              <p className="fintap-steps-card__desc">{step.cardDesc}</p>
            </div>
          </ScrollReveal>
        ))}
      </ol>
    </div>
  );
}
