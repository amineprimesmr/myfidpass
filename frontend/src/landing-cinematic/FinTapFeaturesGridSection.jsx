import { fintapFeaturesGridItems } from "./fintap-features-data.js";
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
          <h2 id="fintap-features-grid-heading" className="fintap-steps-scroll__h2">
            Tout ce qu’il faut pour fidéliser et vendre plus
          </h2>
          <p className="fintap-steps-scroll__intro fintap-features-grid__intro">
            Des notifications illimitées à la fidélité et à la data : tout est pensé pour vous faire gagner du temps et
            garder vos clients engagés.
          </p>
        </header>
        <ul className="fintap-features-grid__list">
          {fintapFeaturesGridItems.map((item) => (
            <li key={item.id} className="fintap-features-grid__card">
              <div className="fintap-features-grid__visual" aria-hidden="true">
                <img
                  className="fintap-features-grid__img"
                  src={item.imageSrc}
                  alt=""
                  width={560}
                  height={360}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="fintap-features-grid__copy">
                <h3 className="fintap-features-grid__card-title">{item.title}</h3>
                <p className="fintap-features-grid__card-desc">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
