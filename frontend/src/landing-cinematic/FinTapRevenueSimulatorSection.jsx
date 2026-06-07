import { useMemo, useState } from "react";
import { FinTapLiquidSlider } from "./FinTapLiquidSlider.jsx";
import { FinTapRevenueRoiChart } from "./FinTapRevenueRoiChart.jsx";
import { ScrollReveal } from "./ScrollReveal.jsx";
import {
  REVENUE_SIMULATOR_DEFAULTS,
  REVENUE_SIMULATOR_LIMITS,
} from "./fintap-revenue-simulator-data.js";
import {
  buildRevenueSimulatorDisclaimer,
  computeRevenueSimulation,
  formatCompactNumber,
  formatEuro,
} from "./fintap-revenue-simulator.js";
import "./fintap-revenue-simulator.css";

/** Section simulateur ROI — carte bleue type Kanal. */
export function FinTapRevenueSimulatorSection() {
  const [dailyVisitors, setDailyVisitors] = useState(
    REVENUE_SIMULATOR_DEFAULTS.dailyVisitors
  );
  const [avgBasket, setAvgBasket] = useState(REVENUE_SIMULATOR_DEFAULTS.avgBasket);

  const results = useMemo(
    () =>
      computeRevenueSimulation({
        dailyVisitors,
        avgBasket,
      }),
    [dailyVisitors, avgBasket]
  );

  const { dailyVisitors: visitorsLimits, avgBasket: basketLimits } =
    REVENUE_SIMULATOR_LIMITS;

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
            Estimez votre retour sur investissement en quelques secondes.
          </p>
        </ScrollReveal>
      </header>

      <ScrollReveal delay={0.08}>
        <div className="fintap-revenue-simulator__wrap">
          <div className="fintap-revenue-simulator__card" aria-live="polite">
            <div className="fintap-revenue-simulator__sliders">
              <div className="fintap-revenue-simulator__slider-col">
                <p className="fintap-revenue-simulator__slider-kicker">Visiteurs quotidiens</p>
                <FinTapLiquidSlider
                  theme="blue"
                  min={visitorsLimits.min}
                  max={visitorsLimits.max}
                  step={5}
                  value={dailyVisitors}
                  onChange={setDailyVisitors}
                  ariaLabel="Visiteurs quotidiens"
                  labelsMin={formatCompactNumber(visitorsLimits.min)}
                  labelsMax={`${formatCompactNumber(visitorsLimits.max)}+`}
                />
              </div>
              <div className="fintap-revenue-simulator__slider-col">
                <p className="fintap-revenue-simulator__slider-kicker">Panier moyen (€)</p>
                <FinTapLiquidSlider
                  theme="blue"
                  min={basketLimits.min}
                  max={basketLimits.max}
                  step={1}
                  value={avgBasket}
                  onChange={setAvgBasket}
                  ariaLabel="Panier moyen en euros"
                  labelsMin={`${basketLimits.min}€`}
                  labelsMax={`${basketLimits.max}€`}
                />
              </div>
            </div>

            <div className="fintap-revenue-simulator__headline">
              <div className="fintap-revenue-simulator__headline-main">
                <span className="fintap-revenue-simulator__headline-kicker">
                  Revenu mensuel additionnel potentiel
                </span>
                <p className="fintap-revenue-simulator__headline-value">
                  <strong>{formatEuro(results.first30DaysRevenue)}</strong> générés
                </p>
              </div>
              <div className="fintap-revenue-simulator__roas" aria-label={`ROAS x${results.roiMultiple}`}>
                <span className="fintap-revenue-simulator__roas-label">ROAS</span>
                <span className="fintap-revenue-simulator__roas-value">×{results.roiMultiple}</span>
              </div>
            </div>

            <FinTapRevenueRoiChart points={results.chartPoints} />

            <div className="fintap-revenue-simulator__legend">
              <div className="fintap-revenue-simulator__legend-items">
                <span className="fintap-revenue-simulator__legend-item">
                  <span className="fintap-revenue-simulator__legend-dot fintap-revenue-simulator__legend-dot--revenue" />
                  Revenu {formatEuro(results.revenuePerActiveMember, { maximumFractionDigits: 2 })}
                  /client actif
                </span>
                <span className="fintap-revenue-simulator__legend-item">
                  <span className="fintap-revenue-simulator__legend-dot fintap-revenue-simulator__legend-dot--cost" />
                  Coût {formatEuro(results.costPerActiveMember, { maximumFractionDigits: 2 })}
                  /client actif
                </span>
              </div>
            </div>

            <div className="fintap-revenue-simulator__footer">
              <div className="fintap-revenue-simulator__footer-metrics">
                <div className="fintap-revenue-simulator__footer-metric">
                  <span className="fintap-revenue-simulator__footer-kicker">
                    Revenu mensuel additionnel potentiel :
                  </span>
                  <strong className="fintap-revenue-simulator__footer-value">
                    {formatEuro(results.additionalMonthly)}
                  </strong>
                </div>
                <div className="fintap-revenue-simulator__footer-metric fintap-revenue-simulator__footer-metric--invest">
                  <span className="fintap-revenue-simulator__footer-kicker">Investissement :</span>
                  <strong className="fintap-revenue-simulator__footer-value fintap-revenue-simulator__footer-value--invest">
                    {formatEuro(results.subscriptionMonthly, { maximumFractionDigits: 2 })}
                    <span className="fintap-revenue-simulator__footer-period">/ mois</span>
                  </strong>
                </div>
              </div>
              <a href="/get" className="fintap-revenue-simulator__cta">
                Télécharger l&apos;app commerçant
              </a>
            </div>

            <div className="fintap-revenue-simulator__estimation">
              <p className="fintap-revenue-simulator__disclaimer">
                {buildRevenueSimulatorDisclaimer(results)}
              </p>
              <div
                className="fintap-revenue-simulator__engagement-grid"
                aria-label="Estimation visibilité : avis Google et réseaux sociaux"
              >
                {results.engagementEstimates.map((item) => (
                  <div key={item.id} className="fintap-revenue-simulator__engagement-card">
                    <span className="fintap-revenue-simulator__engagement-icon" aria-hidden="true">
                      <img src={item.icon} alt="" width={22} height={22} decoding="async" />
                    </span>
                    <div className="fintap-revenue-simulator__engagement-copy">
                      <span className="fintap-revenue-simulator__engagement-label">{item.label}</span>
                      <strong className="fintap-revenue-simulator__engagement-value">
                        +{formatCompactNumber(item.value)}
                        <span className="fintap-revenue-simulator__engagement-period">{item.period}</span>
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
