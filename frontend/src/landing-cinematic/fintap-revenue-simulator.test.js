import { describe, expect, it } from "vitest";
import {
  build30DayChart,
  buildRevenueSimulatorDisclaimer,
  computeRevenueSimulation,
  formatCompactNumber,
  formatEuro,
  rampFactorForDay,
  REVENUE_CHART_DAYS,
} from "./fintap-revenue-simulator.js";
import { MYFIDPASS_MONTHLY_COST } from "./fintap-revenue-simulator-data.js";

describe("computeRevenueSimulation", () => {
  it("calcule un revenu additionnel réaliste avec les entrées par défaut", () => {
    const result = computeRevenueSimulation({
      dailyVisitors: 40,
      avgBasket: 22,
    });
    expect(result.additionalMonthly).toBeGreaterThan(200);
    expect(result.additionalMonthly).toBeLessThan(2500);
    expect(result.roiMultiple).toBeGreaterThan(3);
    expect(result.roiMultiple).toBeLessThan(30);
    expect(result.netMonthly).toBe(
      Math.max(0, Math.round(result.additionalMonthly - MYFIDPASS_MONTHLY_COST))
    );
    expect(result.chartPoints).toHaveLength(REVENUE_CHART_DAYS);
    expect(result.first30DaysRevenue).toBe(
      result.chartPoints[result.chartPoints.length - 1].cumulative
    );
  });

  it("évolue de façon cohérente quand le trafic augmente", () => {
    const low = computeRevenueSimulation({ dailyVisitors: 17, avgBasket: 15 });
    const high = computeRevenueSimulation({ dailyVisitors: 100, avgBasket: 15 });
    expect(high.additionalMonthly).toBeGreaterThan(low.additionalMonthly);
    expect(high.additionalMonthly / high.baseMonthlyRevenue).toBeLessThanOrEqual(0.06);
  });

  it("utilise le panier par défaut si absent", () => {
    const result = computeRevenueSimulation({
      dailyVisitors: 33,
      avgBasket: null,
    });
    expect(result.avgBasket).toBe(22);
  });

  it("borne les valeurs extrêmes", () => {
    const low = computeRevenueSimulation({
      dailyVisitors: 0,
      avgBasket: -5,
    });
    expect(low.dailyVisitors).toBe(10);
    expect(low.avgBasket).toBeGreaterThan(0);
  });
});

describe("build30DayChart", () => {
  it("monte progressivement jusqu'au revenu mensuel cible", () => {
    const points = build30DayChart(800);
    expect(points[0].cumulative).toBeGreaterThan(0);
    expect(points[points.length - 1].cumulative).toBe(800);
    expect(rampFactorForDay(30)).toBeCloseTo(1, 2);
  });
});

describe("buildRevenueSimulatorDisclaimer", () => {
  it("mentionne les métriques par client actif", () => {
    const results = computeRevenueSimulation({
      dailyVisitors: 40,
      avgBasket: 22,
    });
    const text = buildRevenueSimulatorDisclaimer(results);
    expect(text).toContain("Estimation :");
    expect(text).toContain("/client actif");
    expect(text).toContain("visiteurs/jour");
    expect(text).not.toContain("indicative");
    expect(text).not.toContain("abonnement réparti");
    expect(text).not.toContain("secteur");
  });
});

describe("formatEuro", () => {
  it("formate en euros FR sans espace avant le symbole", () => {
    expect(formatEuro(702)).toBe("702€");
    expect(formatEuro(7.24, { maximumFractionDigits: 2 })).toBe("7,24€");
    expect(formatEuro(1200)).toMatch(/1[\s\u00a0]?200€/);
    expect(formatEuro(1200)).not.toMatch(/[\s\u00a0]€/);
  });
});

describe("formatCompactNumber", () => {
  it("formate les grands nombres", () => {
    expect(formatCompactNumber(1200)).toMatch(/1[\s\u00a0]?200/);
  });
});
