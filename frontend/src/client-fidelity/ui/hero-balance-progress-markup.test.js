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
    expect(st.tickMarks.map((m) => m.value)).toEqual([0, 25]);
    expect(st.tickMarks[st.tickMarks.length - 1].leftPct).toBe(100);
  });

  it("graduations = paliers réels sur le segment (extrémités seules si aucun palier entre les deux)", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 60,
      programType: "points",
      business: {
        points_reward_tiers: [
          { points: 25, label: "A" },
          { points: 50, label: "B" },
          { points: 100, label: "C" },
        ],
      },
    });
    expect(st.progressMin).toBe(50);
    expect(st.progressMax).toBe(100);
    expect(st.tickMarks.map((m) => m.value)).toEqual([50, 100]);
    expect(st.tickMarks[0].leftPct).toBe(0);
    expect(st.tickMarks[1].leftPct).toBe(100);
  });

  it("segment sans palier strictement entre les deux : seulement les bornes du programme", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 130,
      programType: "points",
      business: {
        points_reward_tiers: [
          { points: 25, label: "A" },
          { points: 50, label: "B" },
          { points: 100, label: "C" },
          { points: 150, label: "D" },
          { points: 200, label: "E" },
        ],
      },
    });
    expect(st.progressMin).toBe(100);
    expect(st.progressMax).toBe(150);
    expect(st.tickMarks.map((m) => m.value)).toEqual([100, 150]);
  });

  it("sans paliers publiés : pas d’échelle générique", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 30,
      programType: "points",
      business: {},
    });
    expect(st.hasProgressScale).toBe(false);
    expect(st.tickMarks).toEqual([]);
  });

  it("programme tampons : libellé singulier", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 1,
      programType: "stamps",
      business: { required_stamps: 10 },
    });
    expect(st.hasProgressScale).toBe(true);
    expect(st.unitWord).toBe("tampon");
    expect(st.nextGoal?.threshold).toBe(10);
    expect(st.pct).toBeCloseTo(10, 5);
    expect(st.tickMarks.map((m) => m.value)).toEqual([0, 10]);
  });
});
