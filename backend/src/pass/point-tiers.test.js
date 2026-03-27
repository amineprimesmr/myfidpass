import { describe, it, expect } from "vitest";
import {
  parsePointRewardTiersFromBusiness,
  frontRewardLabelFromSortedTiers,
  backRewardLinesFromSortedTiers,
  formatBackRewardsFieldValue,
} from "./point-tiers.js";

describe("point-tiers", () => {
  it("parse + tri + libellé face avant = premier palier avec label (comme SaaS)", () => {
    const business = {
      points_reward_tiers: JSON.stringify([
        { points: 100, label: "Burger offert" },
        { points: 20, label: "Boisson offerte" },
      ]),
    };
    const sorted = parsePointRewardTiersFromBusiness(business);
    expect(sorted).toEqual([
      { points: 20, label: "Boisson offerte" },
      { points: 100, label: "Burger offert" },
    ]);
    expect(frontRewardLabelFromSortedTiers(sorted)).toBe("Boisson offerte");
    expect(backRewardLinesFromSortedTiers(sorted)).toEqual([
      "20 pts = Boisson offerte",
      "100 pts = Burger offert",
    ]);
  });

  it("ignore les entrées sans points valides", () => {
    const business = {
      points_reward_tiers: [{ points: "x", label: "Nope" }, { points: 10, label: "OK" }],
    };
    const sorted = parsePointRewardTiersFromBusiness(business);
    expect(frontRewardLabelFromSortedTiers(sorted)).toBe("OK");
  });

  it("palier sans libellé : pas pour la face avant, mais verso avec défaut", () => {
    const sorted = [
      { points: 5, label: "" },
      { points: 10, label: "Cadeau" },
    ];
    expect(frontRewardLabelFromSortedTiers(sorted)).toBe("Cadeau");
    expect(backRewardLinesFromSortedTiers(sorted)).toEqual(["5 pts = Récompense", "10 pts = Cadeau"]);
  });

  it("aucun palier valide → Paliers en magasin", () => {
    expect(frontRewardLabelFromSortedTiers([])).toBe("Paliers en magasin");
  });

  it("formatBackRewardsFieldValue : vide → message commerce", () => {
    expect(formatBackRewardsFieldValue([], 0)).toMatch(/commerce/);
  });

  it("formatBackRewardsFieldValue : 25 pts entre deux paliers → flèche sur le prochain", () => {
    const tiers = [
      { points: 50, label: "Cheese offert" },
      { points: 100, label: "Menu" },
    ];
    const text = formatBackRewardsFieldValue(tiers, 25);
    expect(text).toContain("→  50 pts — Cheese offert");
    expect(text).toContain("○  100 pts — Menu");
    expect(text).toContain("Cumulez des points");
  });

  it("formatBackRewardsFieldValue : 60 pts → premier palier coché", () => {
    const tiers = [
      { points: 50, label: "A" },
      { points: 100, label: "B" },
    ];
    const text = formatBackRewardsFieldValue(tiers, 60);
    expect(text).toContain("✓  50 pts — A");
    expect(text).toContain("→  100 pts — B");
  });
});
