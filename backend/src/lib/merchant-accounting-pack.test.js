import { describe, it, expect } from "vitest";
import { extractEurFromText, deriveAutoValuationModel } from "./merchant-accounting-pack.js";

describe("extractEurFromText", () => {
  it("extrait montants courants", () => {
    expect(extractEurFromText("5€ de réduction")).toBe(5);
    expect(extractEurFromText("Réduction de 7,50 €")).toBe(7.5);
    expect(extractEurFromText("10 EUR offerts")).toBe(10);
    expect(extractEurFromText("aucun montant")).toBeNull();
  });
});

describe("deriveAutoValuationModel", () => {
  it("déduit €/pt depuis paliers libellés", () => {
    const business = { stamp_reward_label: null, stamp_mid_reward_label: null };
    const program = {
      program_type: "points",
      points_per_euro: 1,
      points_reward_tiers: [
        { points: 100, label: "5€ offerts" },
        { points: 200, label: "12 €" },
      ],
    };
    const txs = [];
    const m = deriveAutoValuationModel(business, program, txs);
    expect(m.tier_nominal_discount_eur_by_points["100"]).toBe(5);
    expect(m.tier_nominal_discount_eur_by_points["200"]).toBe(12);
    expect(m.implied_eur_per_point_outstanding).toBeGreaterThan(0);
    expect(m.source).toBe("auto");
  });
});
