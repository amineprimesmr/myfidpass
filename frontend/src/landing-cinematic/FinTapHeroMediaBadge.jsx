import "./fintap-hero-media-badge.css";

const TF1_LOGO = "/assets/logos/tf1.png";

/** Badge presse — bas du panneau (mobile) ou barre hero (desktop, placement top). */
export function FinTapHeroMediaBadge({ placement = "bottom" }) {
  return (
    <div
      className={`fintap-hero-media-badge-anchor fintap-hero-media-badge-anchor--${placement}`}
      aria-hidden="false"
    >
      <div className="fintap-hero-media-badge" aria-label="Vu sur TF1">
        <span className="fintap-hero-media-badge__kicker">Vu sur</span>
        <img
          className="fintap-hero-media-badge__logo"
          src={TF1_LOGO}
          alt="TF1"
          width={52}
          height={22}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}
