import { describe, expect, it } from "vitest";
import { normalizePointsRewardTiersForClient, SIGNUP_REWARD_POINTS } from "./points-reward-tiers.js";

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
});
