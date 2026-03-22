import { describe, it, expect } from "vitest";
import { buildNextRewardBannerState, renderNextRewardBannerMarkup } from "./next-reward-banner-markup.js";

function idEsc(s) {
  return String(s == null ? "" : s);
}

describe("renderNextRewardBannerMarkup (ligne unique)", () => {
  it("affiche libellé, barre de progression et 0/x pts sans +N redondant", () => {
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
    expect(html).toContain("fidelity-v2-next-reward-bar-inline");
    expect(html).toContain("--fid-next-pct:");
    expect(html).not.toMatch(/\+<strong>/);
  });

  it("affiche la barre pour la prochaine récompense tampons", () => {
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
    expect(html).toContain("fidelity-v2-next-reward-bar-inline");
    expect(html).toContain("Viennoiserie");
    expect(html).not.toMatch(/\+<strong>/);
  });
});
