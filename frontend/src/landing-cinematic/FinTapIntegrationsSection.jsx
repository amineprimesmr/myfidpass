import { FINTAP } from "./fintap-data.js";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapIntegrationsSection() {
  return (
    <section className="fintap-section fintap-section--integrations" id="integrations">
      <div className="fintap-section-inner">
        <ScrollReveal className="fintap-int-head">
          <h2 className="fintap-h3 fintap-h3--int">
            Supercharged with <em className="fintap-h2-em fintap-h2-em--blue">integrations</em>
          </h2>
        </ScrollReveal>
        <div className="fintap-int-grid">
          {FINTAP.integrations.map((x, i) => (
            <ScrollReveal key={x.name} className="fintap-int-card" delay={i * 0.02}>
              <p className="fintap-int-name">{x.name}</p>
              <p className="fintap-int-desc">{x.desc}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
