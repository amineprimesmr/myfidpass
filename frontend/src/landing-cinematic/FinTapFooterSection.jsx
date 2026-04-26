import { FINTAP } from "./fintap-data.js";
import { ScrollReveal } from "./ScrollReveal.jsx";

export function FinTapFooterSection() {
  return (
    <footer className="fintap-footer">
      <div className="fintap-section-inner">
        <ScrollReveal>
          <p className="fintap-footer-disclaimer">{FINTAP.footer.disclaimer}</p>
          <p className="fintap-footer-legal">
            <a
              className="fintap-link"
              href="https://www.behance.net/gallery/185028847/UIUX-Branding-for-a-digital-bank?tracking_source=search_projects&l=1"
              rel="noreferrer"
              target="_blank"
            >
              the original work
            </a>{" "}
            — {FINTAP.footer.legal}
          </p>
        </ScrollReveal>
      </div>
    </footer>
  );
}
