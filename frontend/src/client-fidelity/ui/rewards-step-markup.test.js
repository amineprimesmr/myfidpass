import { describe, it, expect } from "vitest";
import { renderRewardsStepMarkup } from "./rewards-step-markup.js";

function idEsc(s) {
  return String(s == null ? "" : s);
}

describe("renderRewardsStepMarkup", () => {
  it("affiche le palier 10 pts même si absent du JSON (signup_reward_label)", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        signup_reward_label: "Boisson offerte",
        points_reward_tiers: [{ points: 50, label: "Dessert" }],
      },
      member: { points: 10 },
      programType: "points",
      balanceUnit: "pts",
    });
    expect(html).toContain("Boisson offerte");
    expect(html).toContain("fid-reward-card--unlocked");
  });

  it("affiche une grille de cartes pour les paliers points", () => {
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
    expect(html).toContain("fid-rewards-block");
    expect(html).toContain("fid-rewards-grid");
    expect(html).toContain("Boisson");
    expect(html).toContain("Menu");
    expect(html).toContain("50 points");
    expect(html).toContain("fid-reward-card");
    expect(html).toContain("data-fid-reward-trigger");
    expect(html).toContain("fid-reward-card__surface");
    expect(html).toContain("/assets/gift/gift1.png");
    expect(html).toContain("/assets/gift/gift2.png");
    expect(html).not.toContain("fid-tiers-track");
  });

  it("utilise image_url du palier si fourni", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        points_reward_tiers: [{ points: 25, label: "Cafe", image_url: "https://example.com/cafe.png" }],
      },
      member: { points: 0 },
      programType: "points",
      balanceUnit: "pts",
    });
    expect(html).toContain("fid-reward-card__img");
    expect(html).toContain("https://example.com/cafe.png");
  });

  it("affiche paliers programme tampons (unité tampons)", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        required_stamps: 10,
        start_game_reward_label: "Boisson offerte",
        stamp_mid_reward_label: "Viennoiserie",
        stamp_reward_label: "Menu offert",
      },
      member: { points: 3 },
      programType: "stamps",
      balanceUnit: "tampons",
    });
    expect(html).toContain("Boisson offerte");
    expect(html).toContain("Début du jeu");
    expect(html).toContain("Viennoiserie");
    expect(html).toContain("Menu offert");
    expect(html).toContain("5 tampons");
  it("affiche « Récompense utilisée » sur le palier début du jeu tampons", () => {
    const html = renderRewardsStepMarkup(idEsc, {
      business: {
        required_stamps: 10,
        start_game_reward_label: "Boisson offerte",
        stamp_reward_label: "Menu offert",
      },
      member: {
        points: 3,
        rewards_usage: { stamp_start_game_used: true },
      },
      programType: "stamps",
      balanceUnit: "tampons",
    });
    expect(html).toContain("fid-reward-card--used");
    expect(html).toContain("Récompense utilisée");
    expect(html).toContain("fid-reward-card__title--used");
    expect(html).not.toContain("data-fid-reward-trigger");
  });
});
