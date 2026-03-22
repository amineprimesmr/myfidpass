import { describe, it, expect } from "vitest";
import { renderRewardsStepMarkup } from "./rewards-step-markup.js";

function idEsc(s) {
  return String(s == null ? "" : s);
}

describe("renderRewardsStepMarkup", () => {
  it("affiche paliers points et message de progression", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        points_reward_tiers: [
          { points: 50, label: "Boisson" },
          { points: 100, label: "Menu" },
        ],
      },
      member: { points: 40 },
      rewards: [],
      programType: "points",
      balanceUnit: "pts",
      stampEmoji: "",
    });
    expect(html).toContain("Paliers du programme");
    expect(html).toContain("Boisson");
    expect(html).toContain("Menu");
    expect(html).toContain("Encore");
    expect(html).toContain("50");
    expect(html).toContain("fid-tiers-bar");
  });

  it("affiche paliers tampons avec récompense intermédiaire à 5", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        required_stamps: 10,
        stamp_mid_reward_label: "Viennoiserie",
        stamp_reward_label: "Menu offert",
      },
      member: { points: 3 },
      rewards: [],
      programType: "stamps",
      balanceUnit: "tampons",
      stampEmoji: "🥐",
    });
    expect(html).toContain("🥐");
    expect(html).toContain("Viennoiserie");
    expect(html).toContain("Menu offert");
    expect(html).toContain("5");
    expect(html).toContain("10");
  });
});
