import { describe, expect, it } from "vitest";
import { buildHeroBalanceProgressState, renderHeroBalanceProgressMarkup } from "./hero-balance-progress-markup.js";

describe("buildHeroBalanceProgressState", () => {
  it("échelle linéaire 0→max : 10 pts sur paliers 10…250", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 10,
      programType: "points",
      business: {
        points_reward_tiers: [
          { points: 10, label: "Boisson" },
          { points: 50, label: "Dessert" },
          { points: 100, label: "Cheese" },
          { points: 150, label: "Menu" },
          { points: 200, label: "Formule" },
          { points: 250, label: "-20 %" },
        ],
      },
    });
    expect(st.progressMin).toBe(0);
    expect(st.progressMax).toBe(250);
    expect(st.pct).toBeCloseTo(4, 1);
    expect(st.tickMarks[0]).toEqual({ value: 0, leftPct: 0 });
    expect(st.tickMarks.find((m) => m.value === 10)?.leftPct).toBeCloseTo(4, 1);
    expect(st.tickMarks.find((m) => m.value === 50)?.leftPct).toBeCloseTo(20, 1);
    expect(st.nextGoal?.threshold).toBe(50);
  });

  it("réinjecte le palier 10 pts si absent du JSON (legacy migration v26)", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 10,
      programType: "points",
      business: {
        signup_reward_label: "Boisson offerte",
        points_reward_tiers: [
          { points: 50, label: "Dessert" },
          { points: 100, label: "Cheese" },
        ],
      },
    });
    expect(st.tickMarks.find((m) => m.value === 10)?.leftPct).toBeCloseTo(10, 1);
    expect(st.pct).toBeCloseTo(10, 1);
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

  it("programme tampons : libellé + échelle linéaire avec origine 0", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 1,
      programType: "stamps",
      business: { required_stamps: 10 },
    });
    expect(st.hasProgressScale).toBe(true);
    expect(st.unitWord).toBe("tampon");
    expect(st.nextGoal?.threshold).toBe(10);
    expect(st.progressMax).toBe(10);
    expect(st.pct).toBeCloseTo(10, 1);
    expect(st.tickMarks[0].value).toBe(0);
  });

  it("tampons : grille visuelle sans texte « X tampons »", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 3,
      programType: "stamps",
      business: { required_stamps: 10, stamp_emoji: "☕" },
    });
    const html = renderHeroBalanceProgressMarkup((s) => s, st);
    expect(html).toContain("fidelity-hero-stamps-grid");
    expect(html).toContain('/assets/icons/cafe.png');
    expect(html).not.toContain("fidelity-hero-progress-amount");
    expect(html).not.toContain("fidelity-hero-progress-unit");
    expect(html).not.toContain("fidelity-hero-progress-track");
  });

  it("tampons catalogue burger : image PNG, pas le mot burger répété", () => {
    const st = buildHeroBalanceProgressState({
      memberPoints: 0,
      programType: "stamps",
      business: { required_stamps: 10, stamp_emoji: "burger" },
    });
    const html = renderHeroBalanceProgressMarkup((s) => s, st);
    expect(html).toContain('src="/assets/icons/burger.png"');
    expect(html).toContain("fidelity-hero-stamp-icon");
    expect(html).not.toMatch(/>burger</);
    expect(html).not.toContain("fidelity-hero-progress-track");
  });
});
