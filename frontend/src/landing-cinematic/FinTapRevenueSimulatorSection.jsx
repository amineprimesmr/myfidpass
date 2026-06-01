import { useMemo, useState } from "react";
import { FinTapCommerceNameField } from "./FinTapCommerceNameField.jsx";
import { FinTapLiquidSlider } from "./FinTapLiquidSlider.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";
import {
  DEFAULT_REVENUE_SECTOR_ID,
  MYFIDPASS_MONTHLY_COST,
  REVENUE_SECTOR_OPTIONS,
  REVENUE_SIMULATOR_CASE_STUDY,
  REVENUE_SIMULATOR_DEFAULTS,
} from "./fintap-revenue-simulator-data.js";
import {
  buildRevenueSimulatorDisclaimer,
  computeRevenueSimulation,
  formatEuro,
} from "./fintap-revenue-simulator.js";
import "./fintap-revenue-simulator.css";

const CLIENTS_MIN = 5;
const CLIENTS_MAX = 250;
const BASKET_MIN = 3;
const BASKET_MAX = 200;

/** Section simulateur — fond site unifié + carte blanche. */
export function FinTapRevenueSimulatorSection() {
  const [sectorId, setSectorId] = useState(DEFAULT_REVENUE_SECTOR_ID);
  const [clientsPerDay, setClientsPerDay] = useState(REVENUE_SIMULATOR_DEFAULTS.clientsPerDay);
  const [avgBasket, setAvgBasket] = useState(String(REVENUE_SIMULATOR_DEFAULTS.avgBasket));

  const parsedBasket = avgBasket.trim() === "" ? null : Number(avgBasket.replace(",", "."));

  const results = useMemo(
    () =>
      computeRevenueSimulation({
        clientsPerDay,
        avgBasket: parsedBasket,
        sectorId,
      }),
    [clientsPerDay, parsedBasket, sectorId]
  );

  return (
    <section
      className="fintap-revenue-simulator"
      id="simulateur-revenus"
      aria-labelledby="fintap-revenue-simulator-heading"
    >
      <header className="fintap-revenue-simulator__hero">
        <ScrollReveal>
          <h2 id="fintap-revenue-simulator-heading" className="fintap-revenue-simulator__title">
            Combien Myfidpass peut vous rapporter&nbsp;?
          </h2>
          <p className="fintap-revenue-simulator__lead">
            Estimez votre revenu additionnel en quelques secondes.
          </p>
        </ScrollReveal>
      </header>

      <ScrollReveal delay={0.08}>
        <div className="fintap-revenue-simulator__sim-wrap">
          <div className="fintap-revenue-simulator__sim is-active">
            <div className="fintap-revenue-simulator__form">
              <FinTapCommerceNameField
                id="fintap-revenue-commerce-name"
                label="Nom de votre commerce"
                placeholder="Recherchez votre établissement sur Google"
                detectCategory={false}
                syncPending
              />

              <div className="fintap-revenue-simulator__field">
                <label className="fintap-revenue-simulator__label" htmlFor="fintap-revenue-sector">
                  Secteur d&apos;activité
                </label>
                <select
                  id="fintap-revenue-sector"
                  className="fintap-revenue-simulator__select"
                  value={sectorId}
                  onChange={(e) => setSectorId(e.target.value)}
                >
                  {REVENUE_SECTOR_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fintap-revenue-simulator__field">
                <label className="fintap-revenue-simulator__label" htmlFor="fintap-revenue-basket">
                  Panier moyen (€)
                </label>
                <input
                  id="fintap-revenue-basket"
                  type="number"
                  className="fintap-revenue-simulator__input"
                  min={BASKET_MIN}
                  max={BASKET_MAX}
                  step="0.5"
                  value={avgBasket}
                  onChange={(e) => setAvgBasket(e.target.value)}
                />
              </div>
            </div>

            <div className="fintap-revenue-simulator__slider-block">
              <p className="fintap-revenue-simulator__slider-label">Clients par jour</p>
              <FinTapLiquidSlider
                min={CLIENTS_MIN}
                max={CLIENTS_MAX}
                value={clientsPerDay}
                onChange={setClientsPerDay}
                ariaLabel="Clients par jour"
              />
            </div>

            <div className="fintap-revenue-simulator__compare" aria-live="polite">
              <div className="fintap-revenue-simulator__compare-row fintap-revenue-simulator__compare-row--cost">
                <span className="fintap-revenue-simulator__compare-label">
                  Investissement Myfidpass
                </span>
                <strong className="fintap-revenue-simulator__compare-value">
                  {formatEuro(MYFIDPASS_MONTHLY_COST, { maximumFractionDigits: 2 })} /mois
                </strong>
              </div>
              <div className="fintap-revenue-simulator__compare-net">
                <div>
                  <span className="fintap-revenue-simulator__compare-label">Gain net estimé</span>
                  <strong className="fintap-revenue-simulator__compare-net-value">
                    +{formatEuro(results.netMonthly)} /mois
                  </strong>
                </div>
                <span className="fintap-revenue-simulator__compare-roi">
                  ×{results.roiMultiple} votre investissement
                </span>
              </div>
            </div>

            <div className="fintap-revenue-simulator__sim-details">
              <aside
                className="fintap-revenue-simulator__example"
                aria-label="Exemple client Myfidpass"
              >
                <p className="fintap-revenue-simulator__example-kicker">Exemple concret</p>
                <p className="fintap-revenue-simulator__example-body">
                  <strong>{REVENUE_SIMULATOR_CASE_STUDY.name}</strong>,{" "}
                  {REVENUE_SIMULATOR_CASE_STUDY.sectorLabel}&nbsp;:{" "}
                  <strong>{formatEuro(REVENUE_SIMULATOR_CASE_STUDY.netMonthly)}</strong> de gain net
                  / mois et{" "}
                  <strong>+{REVENUE_SIMULATOR_CASE_STUDY.googleReviewsPerMonth} avis Google</strong>
                  .
                </p>
              </aside>

              <ul className="fintap-revenue-simulator__stats">
                <li>
                  <span className="fintap-revenue-simulator__stat-label">Clients fidélisés</span>
                  <strong>{results.loyalClientsPerMonth}</strong>
                </li>
                <li>
                  <span className="fintap-revenue-simulator__stat-label">Avis Google en plus</span>
                  <strong>+{results.extraGoogleReviewsPerMonth} / mois</strong>
                </li>
                <li>
                  <span className="fintap-revenue-simulator__stat-label">Investissement / mois</span>
                  <strong>
                    {formatEuro(results.subscriptionMonthly, { maximumFractionDigits: 2 })}
                  </strong>
                </li>
                <li>
                  <span className="fintap-revenue-simulator__stat-label">Gain net mensuel*</span>
                  <strong>+{formatEuro(results.netMonthly)}</strong>
                </li>
              </ul>

              <p className="fintap-revenue-simulator__disclaimer">
                {buildRevenueSimulatorDisclaimer(results)}
              </p>

              <div className="fintap-revenue-simulator__cta-wrap">
                <a href="/get" className="fintap-revenue-simulator__start">
                  Télécharger l&apos;app
                  <span aria-hidden>→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
