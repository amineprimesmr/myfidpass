import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROULETTE_POINT_REWARDS,
  DEFAULT_ROULETTE_STAMP_REWARDS,
  selectRouletteReward,
} from "./games-helpers.js";

describe("DEFAULT_ROULETTE_POINT_REWARDS", () => {
  it("contient PERDU et cadeau gift", () => {
    expect(DEFAULT_ROULETTE_POINT_REWARDS.length).toBeGreaterThan(0);
    const kinds = DEFAULT_ROULETTE_POINT_REWARDS.map((r) => r.kind);
    expect(kinds).toContain("none");
    expect(kinds).toContain("gift");
  });
});

describe("DEFAULT_ROULETTE_STAMP_REWARDS", () => {
  it("contient PERDU et cadeau gift", () => {
    expect(DEFAULT_ROULETTE_STAMP_REWARDS.length).toBeGreaterThan(0);
    const kinds = DEFAULT_ROULETTE_STAMP_REWARDS.map((r) => r.kind);
    expect(kinds).toContain("none");
    expect(kinds).toContain("gift");
  });
});

describe("selectRouletteReward", () => {
  const mixedGift = [
    { kind: "none", code: "no_reward", label: "PERDU", weight: 100, active: 1 },
    { kind: "gift", code: "cadeau", label: "Cadeau", weight: 5, active: 1, value: null },
  ];
  const mixedPoints = [
    { kind: "none", code: "no_reward", label: "PERDU", weight: 100, active: 1 },
    { kind: "points", code: "p10", label: "+10", weight: 5, active: 1, value: { points: 10 } },
  ];

  it("premier spin : tire uniquement parmi les lots gagnants (gift / points / tampons)", () => {
    for (let i = 0; i < 40; i++) {
      const r = selectRouletteReward(mixedGift, 0);
      expect(r).toBeTruthy();
      expect(r.kind).toBe("gift");
    }
    for (let i = 0; i < 40; i++) {
      const r = selectRouletteReward(mixedPoints, 0);
      expect(r).toBeTruthy();
      expect(r.kind).toBe("points");
    }
  });

  it("spins suivants : peut retomber sur PERDU", () => {
    const kinds = new Set();
    for (let i = 0; i < 80; i++) {
      kinds.add(selectRouletteReward(mixedGift, 1)?.kind);
    }
    expect(kinds.has("none")).toBe(true);
  });
});
