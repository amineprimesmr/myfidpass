import { describe, it, expect } from "vitest";
import { buildNextRewardBannerState, renderNextRewardBannerMarkup } from "./next-reward-banner-markup.js";

function idEsc(s) {
  return String(s == null ? "" : s);
}

describe("renderNextRewardBannerMarkup (ligne unique)", () => {
  it("affiche prochaine récompense sur une seule ligne sans barre", () => {
    const state = buildNextRewardBannerState({
      hasMember: true,
      business: { points_reward_tiers: [{ points: 50, label: "Boisson offerte" }] },
      member: { points: 0 },
      programType: "points",
      balanceUnit: "pts",
    });
    expect(state.kind).toBe("next");
    const html = renderNextRewardBannerMarkup(idEsc, state, { businessNameEsc: "Café" });
    expect(html).toContain("fidelity-v2-next-reward-one-line");
    expect(html).toContain("fidelity-v2-next-reward--single-line");
    expect(html).toContain("Boisson offerte");
    expect(html).toContain("0");
    expect(html).toContain("50");
    expect(html).toContain("+<strong>50</strong>");
    expect(html).not.toContain("fidelity-v2-next-reward-bar");
  });

  it("ajoute l’unité sur le manquant pour les tampons", () => {
    const state = buildNextRewardBannerState({
      hasMember: true,
      business: {
        required_stamps: 10,
        stamp_mid_reward_label: "Viennoiserie",
        stamp_reward_label: "Menu",
      },
      member: { points: 3 },
      programType: "stamps",
      balanceUnit: "tampons",
    });
    expect(state.kind).toBe("next");
    const html = renderNextRewardBannerMarkup(idEsc, state, { businessNameEsc: "X" });
    expect(html).toMatch(/\+<strong>\d+<\/strong> tampons/);
    expect(html).toContain("Viennoiserie");
  });
});
