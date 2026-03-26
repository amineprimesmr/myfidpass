import { describe, it, expect } from "vitest";
import { renderRewardsStepMarkup } from "./rewards-step-markup.js";

function idEsc(s) {
  return String(s == null ? "" : s);
}

describe("renderRewardsStepMarkup", () => {
  it("affiche la liste des paliers points", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        points_reward_tiers: [
          { points: 50, label: "Boisson" },
          { points: 100, label: "Menu" },
        ],
      },
      member: { points: 40 },
      programType: "points",
      balanceUnit: "pts",
    });
    expect(html).toContain("fid-tiers-block");
    expect(html).toContain("Boisson");
    expect(html).toContain("Menu");
    expect(html).toContain("50");
    expect(html).toContain("fid-tiers-track");
    expect(html).not.toContain("fid-tiers-progress-card");
  });

  it("affiche paliers programme tampons (unité pts côté client)", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        required_stamps: 10,
        stamp_mid_reward_label: "Viennoiserie",
        stamp_reward_label: "Menu offert",
      },
      member: { points: 3 },
      programType: "stamps",
      balanceUnit: "pts",
    });
    expect(html).toContain("Viennoiserie");
    expect(html).toContain("Menu offert");
    expect(html).toContain("5");
    expect(html).toContain("10");
  });
});
