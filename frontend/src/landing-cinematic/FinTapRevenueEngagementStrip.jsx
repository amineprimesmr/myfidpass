import { formatCompactNumber } from "./fintap-revenue-simulator.js";
import "./fintap-revenue-engagement-strip.css";

/**
 * @param {{ estimates: { id: string, icon: string, label: string, period: string, value: number }[] }} props
 */
export function FinTapRevenueEngagementStrip({ estimates }) {
  return (
    <div
      className="fintap-revenue-engagement-strip"
      aria-label="Estimation visibilité : avis Google et réseaux sociaux"
    >
      {estimates.map((item) => (
        <article key={item.id} className="fintap-revenue-engagement-strip__card">
          <span className="fintap-revenue-engagement-strip__icon" aria-hidden="true">
            <img src={item.icon} alt="" width={20} height={20} decoding="async" />
          </span>
          <div className="fintap-revenue-engagement-strip__copy">
            <span className="fintap-revenue-engagement-strip__label">{item.label}</span>
            <strong className="fintap-revenue-engagement-strip__value">
              +{formatCompactNumber(item.value)}
              <span className="fintap-revenue-engagement-strip__period">{item.period}</span>
            </strong>
          </div>
        </article>
      ))}
    </div>
  );
}
