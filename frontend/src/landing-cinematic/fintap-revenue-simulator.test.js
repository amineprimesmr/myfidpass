import { describe, expect, it } from "vitest";
import {
  computeRevenueSimulation,
  formatEuro,
  REVENUE_WORKING_DAYS_PER_MONTH,
} from "./fintap-revenue-simulator.js";
import { mapSuggestedCategoryToSectorId } from "./fintap-revenue-simulator-data.js";

describe("computeRevenueSimulation", () => {
  it("calcule un revenu additionnel positif avec des entrées plausibles", () => {
    const result = computeRevenueSimulation({
      clientsPerDay: 50,
      avgBasket: 14,
      sectorId: "fastfood",
    });
    expect(result.visitsPerMonth).toBe(50 * REVENUE_WORKING_DAYS_PER_MONTH);
    expect(result.additionalMonthly).toBeGreaterThan(0);
    expect(result.additionalAnnual).toBe(result.additionalMonthly * 12);
    expect(result.netMonthly).toBe(Math.round(result.additionalMonthly - 49.99));
    expect(result.roiMultiple).toBeGreaterThan(1);
  });

  it("utilise le panier par défaut du secteur si absent", () => {
    const result = computeRevenueSimulation({
      clientsPerDay: 30,
      avgBasket: null,
      sectorId: "cafe",
    });
    expect(result.avgBasket).toBe(6.5);
  });

  it("borne les valeurs extrêmes", () => {
    const low = computeRevenueSimulation({
      clientsPerDay: 0,
      avgBasket: -5,
      sectorId: "fastfood",
    });
    expect(low.clientsPerDay).toBe(1);
    expect(low.avgBasket).toBeGreaterThan(0);
  });
});

describe("mapSuggestedCategoryToSectorId", () => {
  it("retourne le secteur connu ou le défaut", () => {
    expect(mapSuggestedCategoryToSectorId("coiffure")).toBe("coiffure");
    expect(mapSuggestedCategoryToSectorId("unknown")).toBe("fastfood");
    expect(mapSuggestedCategoryToSectorId(null)).toBe("fastfood");
  });
});

describe("formatEuro", () => {
  it("formate en euros FR", () => {
    expect(formatEuro(1200)).toMatch(/1[\s\u00a0]?200/);
  });
});
