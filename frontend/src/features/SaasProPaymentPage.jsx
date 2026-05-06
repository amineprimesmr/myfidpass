import { useEffect, useMemo, useRef, useState } from "react";
import liquidGlassSwitcherFilters from "./liquid-glass-switcher-filters-fragment.html?raw";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Megaphone,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { buildStripeSaasPaymentUrl } from "../config.js";

const HERO_IMG =
  "url(https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1800&q=80)";

const AVA = [
  "https://i.pravatar.cc/96?img=12",
  "https://i.pravatar.cc/96?img=33",
  "https://i.pravatar.cc/96?img=47",
];

const BASE_COMPARE = [
  { name: "Carte fidélité Wallet", tag: "Apple & Google", value: "Illimité", Icon: Wallet },
  { name: "Membres et cartes suivis", tag: "Tableau de bord", value: "Illimité", Icon: Wallet },
  { name: "Notifications push", tag: "Campagnes & relances", value: "Illimité", Icon: Megaphone },
  { name: "Flyers de jeu & visuels", tag: "Export HD & partage", value: "Inclus", Icon: Sparkles },
];

const EXTRA_COMPARE = [
  { name: "Caisse & points", tag: "Scan QR & recherche client", value: "Inclus", Icon: Check },
  { name: "Missions avis & réseaux", tag: "Bonus points configurables", value: "Activable", Icon: Sparkles },
];

function CompareTag({ children }) {
  return <span className="saas-pay-model-cost">{children}</span>;
}

function FeatureIcon({ kind }) {
  if (kind === "check") {
    return (
      <span className="saas-pay-row-icon" style={{ color: "#fff" }}>
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="saas-pay-row-icon" style={{ color: "#5c5c68" }}>
      <X size={14} strokeWidth={2.5} />
    </span>
  );
}

function FeatureRow({ icon, children }) {
  const kind = icon === "check" ? "check" : "x";
  return (
    <div className="saas-pay-row">
      <FeatureIcon kind={kind} />
      {children}
    </div>
  );
}

function wireLiquidGlassTrackPrevious(switcherEl) {
  if (!switcherEl || switcherEl.dataset.liquidGlassTrackWired === "1") return;
  switcherEl.dataset.liquidGlassTrackWired = "1";
  const radios = switcherEl.querySelectorAll('input[type="radio"]');
  let previousValue = null;
  const initiallyChecked = switcherEl.querySelector('input[type="radio"]:checked');
  if (initiallyChecked) {
    previousValue = initiallyChecked.getAttribute("c-option");
    switcherEl.setAttribute("c-previous", previousValue);
  }
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        switcherEl.setAttribute("c-previous", previousValue ?? "");
        previousValue = radio.getAttribute("c-option");
      }
    });
  });
}

export default function SaasProPaymentPage() {
  const [annual, setAnnual] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const liquidGlassSwitcherRef = useRef(null);

  const stripeUrl = useMemo(() => buildStripeSaasPaymentUrl(), []);

  useEffect(() => {
    wireLiquidGlassTrackPrevious(liquidGlassSwitcherRef.current);
  }, []);

  const priceLine = annual
    ? { main: "399€", detail: "facturé annuellement" }
    : { main: "49,99€", detail: "par mois" };

  const compareRows = expanded ? [...BASE_COMPARE, ...EXTRA_COMPARE] : BASE_COMPARE;

  return (
    <div className="saas-pay" style={{ "--saas-hero-img": HERO_IMG }}>
      <main className="saas-pay-main">
        <header className="saas-pay-hero" aria-labelledby="saas-pay-promo-heading">
          <div className="saas-pay-hero-bg" aria-hidden="true" />
          <div className="saas-pay-hero-bg-blur" aria-hidden="true" />
          <div className="saas-pay-hero-inner">
            <a className="saas-pay-back" href="/app" id="saas-pro-payment-back">
              <ArrowLeft size={16} strokeWidth={2.5} aria-hidden="true" />
              Retour
            </a>
            <div className="saas-pay-hero-promo">
              <p className="saas-pay-kicker">Offre spéciale</p>
              <h1 className="saas-pay-hero-off" id="saas-pay-promo-heading">
                −30&nbsp;%
              </h1>
              <p className="saas-pay-hero-tag">Payez moins, fidélisez plus</p>
            </div>
          </div>
        </header>

        <section className="saas-pay-sheet" aria-label="Abonnement Pro MyFidPass">
          <h2 className="saas-pay-h1">Passez au plan Pro</h2>
          <p className="saas-pay-sub">
            Carte Wallet, caisse, notifications et campagnes&nbsp;: tout pour votre fidélité digitale avec MyFidPass.
          </p>

          <div className="saas-pay-trust">
            <div className="saas-pay-trust-avatars" aria-hidden="true">
              {AVA.map((src) => (
                <img key={src} className="saas-pay-ava" src={src} alt="" width={38} height={38} loading="lazy" />
              ))}
            </div>
            <div className="saas-pay-trust-badge">Des commerces comme le vôtre nous font déjà confiance</div>
          </div>

          <div className="saas-pay-billing">
            <div className="saas-pay-billing-liquid">
              <fieldset ref={liquidGlassSwitcherRef} className="switcher">
                <legend className="switcher__legend">Facturation mensuelle ou annuelle</legend>
                <label className="switcher__option">
                  <input
                    className="switcher__input"
                    type="radio"
                    name="saasBillingPeriod"
                    value="monthly"
                    checked={!annual}
                    onChange={() => setAnnual(false)}
                    aria-label="Mensuel"
                    {...{ "c-option": "1" }}
                  />
                  <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36">
                    <path
                      fill="var(--c)"
                      fillRule="evenodd"
                      d="M18 12a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                      clipRule="evenodd"
                    />
                    <path
                      fill="var(--c)"
                      d="M17 6.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 7.742a1 1 0 1 1 1.618 1.176L24.1 11.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 13.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM29.722 20.795a1 1 0 0 1-.619 1.902l-2.853-.927a1 1 0 1 1 .618-1.902l2.854.927ZM25.862 27.159a1 1 0 0 1-1.618 1.175l-1.763-2.427a1 1 0 1 1 1.618-1.175l1.763 2.427ZM19 30.038a1 1 0 0 1-2 0v-3a1 1 0 1 1 2 0v3ZM11.755 28.334a1 1 0 0 1-1.618-1.175l1.764-2.427a1 1 0 1 1 1.618 1.175l-1.764 2.427ZM6.896 22.697a1 1 0 1 1-.618-1.902l2.853-.927a1 1 0 1 1 .618 1.902l-2.853.927ZM6.278 15.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 8.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
                    />
                  </svg>
                </label>
                <label className="switcher__option">
                  <input
                    className="switcher__input"
                    type="radio"
                    name="saasBillingPeriod"
                    value="annual"
                    checked={annual}
                    onChange={() => setAnnual(true)}
                    aria-label="Annuel"
                    {...{ "c-option": "2" }}
                  />
                  <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36">
                    <path
                      fill="var(--c)"
                      d="M12.5 8.473a10.968 10.968 0 0 1 8.785-.97 7.435 7.435 0 0 0-3.737 4.672l-.09.373A7.454 7.454 0 0 0 28.732 20.4a10.97 10.97 0 0 1-5.232 7.125l-.497.27c-5.014 2.566-11.175.916-14.234-3.813l-.295-.483C5.53 18.403 7.13 11.93 12.017 8.77l.483-.297Zm4.234.616a8.946 8.946 0 0 0-2.805.883l-.429.234A9 9 0 0 0 10.206 22.5l.241.395A9 9 0 0 0 22.5 25.794l.416-.255a8.94 8.94 0 0 0 2.167-1.99 9.433 9.433 0 0 1-2.782-.313c-5.043-1.352-8.036-6.535-6.686-11.578l.147-.491c.242-.745.573-1.44.972-2.078Z"
                    />
                  </svg>
                </label>
                <div dangerouslySetInnerHTML={{ __html: liquidGlassSwitcherFilters }} />
              </fieldset>
            </div>
            <span className="saas-pay-pill-off">−30&nbsp;%</span>
          </div>

          <div className="saas-pay-card-shell">
            <article className="saas-pay-card">
              <h3 className="saas-pay-plan-name">PRO</h3>
              <p className="saas-pay-plan-desc">
                Pour les commerces qui veulent une fidélité digitale performante sans complexité.
              </p>

              <div className="saas-pay-spotlight">
                <div className="saas-pay-spotlight-top">
                  <Sparkles size={18} strokeWidth={2} className="saas-pay-sparkle" aria-hidden="true" />
                  <div>
                    <p className="saas-pay-spotlight-title">Carte fidélité 100&nbsp;% digitale</p>
                    <p className="saas-pay-spotlight-sub">
                      Apple Wallet et Google Wallet pour vos clients — sans application à installer&nbsp;: ajout depuis la
                      page publique ou le QR.
                    </p>
                  </div>
                </div>
                <div className="saas-pay-spotlight-pill">
                  <Check size={14} strokeWidth={3} aria-hidden="true" />
                  Caisse, tableau de bord et notifications inclus avec Pro
                </div>
              </div>

              <div className="saas-pay-pricing">
                <div className="saas-pay-price-row">
                  <span className="saas-pay-price">{priceLine.main}</span>
                  <span className="saas-pay-price-detail">{priceLine.detail}</span>
                </div>
                <p className="saas-pay-offer-line">Premier mois à 1&nbsp;€ seulement&nbsp;!</p>
              </div>

              <a className="saas-pay-cta" href={stripeUrl} target="_blank" rel="noopener noreferrer">
                Passer à Pro
              </a>

              <div className="saas-pay-section">
                <h4 className="saas-pay-section-title">Inclus</h4>
                <FeatureRow icon="check">
                  <span className="saas-pay-row-text is-included">
                    Création carte fidélité et règles points&nbsp;/ tampons
                  </span>
                </FeatureRow>
                <FeatureRow icon="check">
                  <span className="saas-pay-row-text is-included">
                    Page publique + QR pour ajout de carte client
                  </span>
                </FeatureRow>
                <FeatureRow icon="check">
                  <span className="saas-pay-row-text is-included">
                    Notifications push et relances automatiques
                  </span>
                </FeatureRow>
              </div>
            </article>
          </div>

          <h2 className="saas-pay-compare-heading">Ce que couvre Pro</h2>
          <p className="saas-pay-compare-sub">Une seule offre, les modules essentiels inclus.</p>
          <p className="saas-pay-compare-pro-label">Pro</p>

          <div aria-label="Fonctionnalités incluses">
            {compareRows.map((row) => {
              const Icon = row.Icon;
              return (
                <div key={row.name} className="saas-pay-model-card">
                  <div className="saas-pay-model-head">
                    <span className="saas-pay-model-name">{row.name}</span>
                    <CompareTag>{row.tag}</CompareTag>
                  </div>
                  <div className="saas-pay-model-body">
                    <div className="saas-pay-model-pro-value">
                      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                      {row.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="saas-pay-see-more"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            Voir plus
            <ChevronDown
              size={18}
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
              aria-hidden="true"
            />
          </button>
        </section>
      </main>
    </div>
  );
}
