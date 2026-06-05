import { useMemo, useState } from "react";
import { formatEuro } from "./fintap-revenue-simulator.js";

const WIDTH = 640;
const HEIGHT = 200;
const PAD_X = 8;
const PAD_Y = 16;

/**
 * Courbe ROI 30 jours — style Kanal.
 * @param {{ points: { day: number, cumulative: number, dailyRevenue: number, dailyCost: number }[] }} props
 */
export function FinTapRevenueRoiChart({ points }) {
  const [activeDay, setActiveDay] = useState(null);

  const geometry = useMemo(() => {
    if (!points?.length) return null;
    const maxY = Math.max(...points.map((p) => p.cumulative), 1);
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_Y * 2;

    const coords = points.map((p, i) => {
      const x = PAD_X + (i / (points.length - 1)) * innerW;
      const y = PAD_Y + innerH - (p.cumulative / maxY) * innerH;
      return { ...p, x, y };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(PAD_Y + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(PAD_Y + innerH).toFixed(1)} Z`;

    return { coords, linePath, areaPath, maxY };
  }, [points]);

  if (!geometry) return null;

  const active =
    activeDay != null ? geometry.coords.find((c) => c.day === activeDay) : null;

  return (
    <div className="fintap-revenue-roi-chart">
      <svg
        className="fintap-revenue-roi-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Évolution du revenu additionnel sur 30 jours"
      >
        <defs>
          <linearGradient id="fintap-roi-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>
        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_Y}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_Y}
          className="fintap-revenue-roi-chart__baseline"
        />
        <path d={geometry.areaPath} fill="url(#fintap-roi-area)" />
        <path d={geometry.linePath} className="fintap-revenue-roi-chart__line" />
        {geometry.coords.map((c) => (
          <circle
            key={c.day}
            cx={c.x}
            cy={c.y}
            r={activeDay === c.day ? 5 : 0}
            className="fintap-revenue-roi-chart__dot"
          />
        ))}
        {geometry.coords.map((c) => (
          <rect
            key={`hit-${c.day}`}
            x={c.x - 10}
            y={0}
            width={20}
            height={HEIGHT}
            fill="transparent"
            className="fintap-revenue-roi-chart__hit"
            onMouseEnter={() => setActiveDay(c.day)}
            onFocus={() => setActiveDay(c.day)}
            onMouseLeave={() => setActiveDay(null)}
            onBlur={() => setActiveDay(null)}
            tabIndex={0}
            role="button"
            aria-label={`Jour ${c.day}`}
          />
        ))}
      </svg>

      {active ? (
        <div
          className="fintap-revenue-roi-chart__tooltip"
          style={{ left: `${(active.day / 30) * 100}%` }}
        >
          <span className="fintap-revenue-roi-chart__tooltip-day">Jour {active.day}</span>
          <span>
            Revenu : <strong>{formatEuro(active.dailyRevenue)}</strong>
          </span>
          <span>
            Coût : <strong>{formatEuro(active.dailyCost, { maximumFractionDigits: 2 })}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}
