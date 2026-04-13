import { describe, expect, it } from "vitest";
import { buildHeroBalanceProgressState } from "./hero-balance-progress-markup.js";

describe("buildHeroBalanceProgressState", () => {
  it("segments égaux : graduations équidistantes, remplissage selon les seuils dans chaque segment", () => {
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
    expect(st.progressMax).toBe(125);
    expect(st.nextGoal?.threshold).toBe(25);
    expect(st.pct).toBeCloseTo(20, 5);
    expect(st.tickMarks.map((m) => m.value)).toEqual([25, 125]);
    expect(st.tickMarks.find((x) => x.value === 25)?.leftPct).toBe(0);
    expect(st.tickMarks.find((x) => x.value === 125)?.leftPct).toBe(100);
  });

  it("affiche tous les paliers avec le même écart visuel sur la jauge", () => {
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
    expect(st.progressMax).toBe(100);
    expect(st.pct).toBeCloseTo(73.333333, 3);
    expect(st.tickMarks.map((m) => m.value)).toEqual([25, 50, 100]);
    expect(st.tickMarks.find((x) => x.value === 50)?.leftPct).toBe(50);
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

  it("programme tampons : libellé + échelle complète", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 1,
      programType: "stamps",
      business: { required_stamps: 10 },
    });
    expect(st.hasProgressScale).toBe(true);
    expect(st.unitWord).toBe("tampon");
    expect(st.nextGoal?.threshold).toBe(10);
    expect(st.progressMax).toBe(10);
    expect(st.pct).toBeCloseTo(10, 5);
    expect(st.tickMarks.map((m) => m.value)).toEqual([10]);
    expect(st.tickMarks[0].leftPct).toBe(100);
  });
});
