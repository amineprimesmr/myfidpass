import { describe, it, expect } from "vitest";
import {
  parsePointRewardTiersFromBusiness,
  frontRewardLabelFromSortedTiers,
  backRewardLinesFromSortedTiers,
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
});
