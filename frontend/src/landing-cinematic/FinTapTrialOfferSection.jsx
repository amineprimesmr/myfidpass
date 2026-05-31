import { ScrollReveal } from "./ScrollReveal.jsx";
import "./fintap-trial-offer.css";

const OFFER_PERKS = [
  "Carte fidélité Apple Wallet & Google Wallet",
  "Sans engagement — résiliable à tout moment",
  "Premier mois à 1 €, puis 49,99 €/mois",
];

/** Bandeau offre — 1er mois à 1 €. */
export function FinTapTrialOfferSection() {
  return (
    <section
      className="fintap-trial-offer"
      id="offre-essai"
      aria-labelledby="fintap-trial-offer-heading"
    >
      <div className="fintap-section-inner fintap-trial-offer__inner">
        <ScrollReveal>
          <div className="fintap-trial-offer__card">
            <span className="fintap-trial-offer__badge" aria-hidden>
              −98&nbsp;%
            </span>
            <p className="fintap-trial-offer__eyebrow">Offre de lancement</p>
            <h2 id="fintap-trial-offer-heading" className="fintap-trial-offer__title">
              Essayez 1 mois pour{" "}
              <span className="fintap-trial-offer__price">1&nbsp;€</span>
            </h2>
            <p className="fintap-trial-offer__lead">
              Lancez votre programme de fidélité dès aujourd&apos;hui. Ensuite 49,99&nbsp;€/mois,
              sans engagement.
            </p>
            <ul className="fintap-trial-offer__perks">
              {OFFER_PERKS.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
            <a href="/app?fromLandingOnboarding=1" className="fintap-trial-offer__cta">
              Commencer pour 1&nbsp;€
              <span aria-hidden>→</span>
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
