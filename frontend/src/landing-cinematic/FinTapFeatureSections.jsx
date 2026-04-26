import { FINTAP } from "./fintap-data.js";
import { FinTapPhoneFrame } from "./FinTapPhoneFrame.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapFeatureSections() {
  return (
    <div className="fintap-features">
      {FINTAP.featureBlocks.map((f) => {
        const rev = f.id === "finance" || f.id === "subscriptions";
        return (
          <section
            key={f.id}
            id={f.id}
            className="fintap-section fintap-section--feature fintap-section--tint"
          >
            <div className="fintap-section-inner">
              <div
                className={
                  rev
                    ? "fintap-section-grid fintap-section-grid--rev"
                    : "fintap-section-grid"
                }
              >
                <ScrollReveal className="fintap-section-copy">
                  <p className="fintap-kicker">{f.kicker}</p>
                  <h2 className="fintap-h2">
                    {f.title} <em className="fintap-h2-em">{f.titleEm}</em>
                  </h2>
                  <p className="fintap-lead">{f.body}</p>
                </ScrollReveal>
                <ScrollReveal delay={0.1} className="fintap-section-visual">
                  <FinTapPhoneFrame variant={f.phone} className="mx-auto" />
                </ScrollReveal>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
