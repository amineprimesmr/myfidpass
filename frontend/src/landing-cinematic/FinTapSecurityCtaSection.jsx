import { FINTAP } from "./fintap-data.js";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapSecurityCtaSection() {
  const c = FINTAP.ctaBand;
  return (
    <>
      <section className="fintap-section fintap-section--security" id="security">
        <div className="fintap-section-inner fintap-security-inner">
          <ScrollReveal className="fintap-security-copy">
            <p className="fintap-kicker">{FINTAP.security.line1}</p>
            <h2 className="fintap-h2 fintap-h2--sec">
              <em className="fintap-h2-em fintap-h2-em--blue">{FINTAP.security.line2}</em>
            </h2>
            <p className="fintap-lead">{FINTAP.security.lead}</p>
          </ScrollReveal>
        </div>
      </section>

      <section className="fintap-section fintap-section--cta" id="download">
        <div className="fintap-section-inner">
          <div className="fintap-cta-grid">
            <ScrollReveal className="fintap-cta-qr">
              <p className="fintap-kicker">{c.title}</p>
              <p className="fintap-cta-sub">{c.subtitle}</p>
              <div className="fintap-qr" role="img" aria-label="Zone code QR" />
            </ScrollReveal>
            <ScrollReveal className="fintap-cta-bullets" delay={0.1}>
              <ul className="fintap-cta-list">
                {c.bullets.map((b) => (
                  <li key={b.slice(0, 32)} className="fintap-cta-li">
                    {b}
                  </li>
                ))}
              </ul>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
