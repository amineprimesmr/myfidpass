import { describe, expect, it } from "vitest";
import {
  findNewlyUnlockedPointsTiers,
  highestPointsTierReachedLabel,
  mergePointsRewardTiersForStorage,
  normalizePointsRewardTiersForClient,
  SIGNUP_REWARD_POINTS,
} from "./points-reward-tiers.js";

describe("normalizePointsRewardTiersForClient", () => {
  it("réinjecte le palier 10 pts si absent", () => {
    const out = normalizePointsRewardTiersForClient(
      [{ points: 50, label: "Dessert" }],
      "Boisson offerte",
    );
    expect(out[0]).toEqual({ points: SIGNUP_REWARD_POINTS, label: "Boisson offerte" });
    expect(out[1].points).toBe(50);
  });

  it("ne réinjecte pas si aucun palier configuré", () => {
    expect(normalizePointsRewardTiersForClient([])).toEqual([]);
  });

  it("ne duplique pas si 10 pts déjà présent", () => {
    const raw = [{ points: 10, label: "Boisson" }, { points: 50, label: "Dessert" }];
    expect(normalizePointsRewardTiersForClient(raw)).toEqual(raw);
  });

  it("mergePointsRewardTiersForStorage retire le doublon 10 pts des paliers éditables", () => {
    const raw = [
      { points: 10, label: "Boisson offerte" },
      { points: 10, label: "Doublon" },
      { points: 50, label: "Dessert" },
      { points: 100, label: "Menu" },
    ];
    const out = mergePointsRewardTiersForStorage(raw, "Boisson offerte");
    expect(out.map((t) => t.points)).toEqual([10, 50, 100]);
    expect(out[0].label).toBe("Boisson offerte");
  });

  it("findNewlyUnlockedPointsTiers détecte le franchissement 80→120 avec palier 100", () => {
    const tiers = [
      { points: 10, label: "Boisson" },
      { points: 100, label: "Menu offert" },
    ];
    expect(findNewlyUnlockedPointsTiers(tiers, 80, 120).map((t) => t.points)).toEqual([100]);
    expect(highestPointsTierReachedLabel(tiers, 80)).toBe("Boisson");
    expect(highestPointsTierReachedLabel(tiers, 120)).toBe("Menu offert");
  });
});
