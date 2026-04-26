import { FINTAP } from "./fintap-data.js";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapTestimonialsSection() {
  return (
    <section className="fintap-section fintap-section--testimonials" id="testimonials">
      <div className="fintap-section-inner">
        <ScrollReveal className="fintap-t-head">
          <p className="fintap-kicker">Testimonials</p>
          <h2 className="fintap-h2 fintap-h2--centre">
            What people say
            <br />
            <em className="fintap-h2-em fintap-h2-em--blue">about us</em>
          </h2>
        </ScrollReveal>

        <div className="fintap-t-grid">
          {FINTAP.testimonials.map((t, i) => (
            <ScrollReveal key={t.name + t.role} className="fintap-t-card-wrap" delay={Math.min(i, 8) * 0.02}>
              <blockquote className="fintap-t-card">
                <p className="fintap-t-quote">“{t.quote}”</p>
                <footer className="fintap-t-foot">
                  <div className="fintap-t-avatar" aria-hidden="true" />
                  <div>
                    <p className="fintap-t-name">{t.name}</p>
                    <p className="fintap-t-role">{t.role}</p>
                  </div>
                </footer>
              </blockquote>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
