import { FINTAP_STEPS, FINTAP_STEPS_HEADING, FINTAP_STEPS_INTRO } from "./fintap-steps-data.js";
import { StepVisualByIndex } from "./FinTapStepsScrollVisuals.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapStepsScrollMobile() {
  return (
    <div className="fintap-steps-scroll__mobile">
      <ScrollReveal>
        <h2 id="fintap-steps-heading" className="fintap-steps-scroll__h2">
          {FINTAP_STEPS_HEADING}
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={0.1}>
        <p className="fintap-steps-scroll__intro">{FINTAP_STEPS_INTRO}</p>
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
              <span className="fintap-steps-card__footer-num fintap-steps-mobile__badge" aria-hidden="true">
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
