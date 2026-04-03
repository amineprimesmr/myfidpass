import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROULETTE_POINT_REWARDS,
  DEFAULT_ROULETTE_STAMP_REWARDS,
  selectRouletteReward,
} from "./games-helpers.js";

describe("DEFAULT_ROULETTE_POINT_REWARDS", () => {
  it("ne contient que des lots none ou points", () => {
    expect(DEFAULT_ROULETTE_POINT_REWARDS.length).toBeGreaterThan(0);
    for (const r of DEFAULT_ROULETTE_POINT_REWARDS) {
      expect(["none", "points"]).toContain(r.kind);
      if (r.kind === "points") {
        expect(Number(r.value?.points)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("DEFAULT_ROULETTE_STAMP_REWARDS", () => {
  it("ne contient que des lots none ou stamps", () => {
    expect(DEFAULT_ROULETTE_STAMP_REWARDS.length).toBeGreaterThan(0);
    for (const r of DEFAULT_ROULETTE_STAMP_REWARDS) {
      expect(["none", "stamps"]).toContain(r.kind);
      if (r.kind === "stamps") {
        expect(Number(r.value?.stamps)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("selectRouletteReward", () => {
  const mixed = [
    { kind: "none", code: "no_reward", label: "PERDU", weight: 100, active: 1 },
    { kind: "points", code: "p10", label: "+10", weight: 5, active: 1, value: { points: 10 } },
  ];

  it("premier spin : tire uniquement parmi les lots points/tampons si présents", () => {
    for (let i = 0; i < 40; i++) {
      const r = selectRouletteReward(mixed, 0);
      expect(r).toBeTruthy();
      expect(r.kind).toBe("points");
    }
  });

  it("spins suivants : peut retomber sur PERDU", () => {
    const kinds = new Set();
    for (let i = 0; i < 80; i++) {
      kinds.add(selectRouletteReward(mixed, 1)?.kind);
    }
    expect(kinds.has("none")).toBe(true);
  });
});
