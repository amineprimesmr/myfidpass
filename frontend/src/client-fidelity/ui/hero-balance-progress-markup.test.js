import { describe, expect, it } from "vitest";
import { buildHeroBalanceProgressState } from "./hero-balance-progress-markup.js";

describe("buildHeroBalanceProgressState", () => {
  it("avec paliers : % = avancement vers le palier suivant (pas / dernier palier)", () => {
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
    expect(st.progressMin).toBe(0);
    expect(st.progressMax).toBe(25);
    expect(st.nextGoal?.threshold).toBe(25);
    expect(st.pct).toBeCloseTo((10 / 25) * 100, 5);
    expect(st.ticks[st.ticks.length - 1]).toBe(25);
  });

  it("segment suivant : entre deux paliers", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 50,
      programType: "points",
      business: {
        points_reward_tiers: [
          { points: 25, label: "A" },
          { points: 125, label: "B" },
        ],
      },
    });
    expect(st.progressMin).toBe(25);
    expect(st.progressMax).toBe(125);
    expect(st.pct).toBeCloseTo(((50 - 25) / (125 - 25)) * 100, 5);
  });

  it("sans paliers, échelle min 125 (comportement historique)", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 0,
      programType: "points",
      business: {},
    });
    expect(st.maxScale).toBe(125);
    expect(st.progressMin).toBe(0);
    expect(st.progressMax).toBe(125);
    expect(st.ticks).toEqual([25, 50, 75, 100, 125]);
    expect(st.pct).toBe(0);
  });

  it("sans paliers : pourcentage = points / échelle", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 30,
      programType: "points",
      business: {},
    });
    expect(st.pct).toBeCloseTo((30 / 125) * 100, 5);
  });

  it("programme tampons : libellé singulier", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 1,
      programType: "stamps",
      business: { required_stamps: 10 },
    });
    expect(st.unitWord).toBe("tampon");
    expect(st.nextGoal?.threshold).toBe(10);
    expect(st.pct).toBeCloseTo(10, 5);
  });
});
