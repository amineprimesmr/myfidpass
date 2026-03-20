import { describe, it, expect } from "vitest";
import { DEFAULT_ROULETTE_POINT_REWARDS } from "./games-helpers.js";

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
