import { describe, expect, it } from "vitest";
import { buildHeroBalanceProgressState } from "./hero-balance-progress-markup.js";

describe("buildHeroBalanceProgressState", () => {
  it("utilise le dernier palier comme échelle max quand des paliers existent", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 10,
      programType: "points",
      business: {
        points_reward_tiers: [
          { points: 25, label: "A" },
          { points: 125, label: "B" },
        ],
      },
    });
    expect(st.maxScale).toBe(125);
    expect(st.ticks[st.ticks.length - 1]).toBe(125);
    expect(st.pct).toBeCloseTo((10 / 125) * 100, 5);
  });

  it("sans paliers, borne min125 pour l’échelle type maquette", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 0,
      programType: "points",
      business: {},
    });
    expect(st.maxScale).toBe(125);
    expect(st.ticks).toEqual([25, 50, 75, 100, 125]);
  });

  it("programme tampons : libellé singulier", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 1,
      programType: "stamps",
      business: { required_stamps: 10 },
    });
    expect(st.unitWord).toBe("tampon");
  });
});
