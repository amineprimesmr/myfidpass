import { describe, expect, it } from "vitest";
import { buildHeroFullScaleTickMarks, heroFillPercentEqualSegments } from "./tier-progress.js";

describe("buildHeroFullScaleTickMarks", () => {
  it("affiche chaque palier avec espacement égal sur la barre (0 % … 100 %)", () => {
    const tiers = [
      { threshold: 25, label: "a" },
      { threshold: 50, label: "b" },
      { threshold: 75, label: "c" },
      { threshold: 100, label: "d" },
      { threshold: 125, label: "e" },
    ];
    const m = buildHeroFullScaleTickMarks(tiers);
    expect(m.map((x) => x.value)).toEqual([25, 50, 75, 100, 125]);
    expect(m.map((x) => x.leftPct)).toEqual([0, 25, 50, 75, 100]);
  });

  it("un seul palier : 100 % à droite", () => {
    const m = buildHeroFullScaleTickMarks([{ threshold: 40, label: "x" }]);
    expect(m).toEqual([{ value: 40, leftPct: 100 }]);
  });
});

describe("heroFillPercentEqualSegments", () => {
  it("remplit par segments de largeur égale entre seuils", () => {
    const tiers = [
      { threshold: 10, label: "a" },
      { threshold: 100, label: "b" },
    ];
    expect(heroFillPercentEqualSegments(tiers, 0)).toBe(0);
    expect(heroFillPercentEqualSegments(tiers, 5)).toBeCloseTo(25, 5);
    expect(heroFillPercentEqualSegments(tiers, 10)).toBeCloseTo(50, 5);
    expect(heroFillPercentEqualSegments(tiers, 55)).toBeCloseTo(75, 5);
    expect(heroFillPercentEqualSegments(tiers, 100)).toBe(100);
  });
});
