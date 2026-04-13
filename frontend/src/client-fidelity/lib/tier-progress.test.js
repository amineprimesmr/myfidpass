import { describe, expect, it } from "vitest";
import { buildHeroFullScaleTickMarks, heroFillPercentEqualSegments, parsePointTiers } from "./tier-progress.js";

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

describe("parsePointTiers", () => {
  it("expose imageUrl optionnel (image_url / imageUrl / image)", () => {
    const tiers = parsePointTiers({
      points_reward_tiers: [
        { points: 10, label: "A", image_url: "https://x/a.png" },
        { points: 20, label: "B", imageUrl: "https://x/b.png" },
        { points: 30, label: "C", image: "https://x/c.png" },
      ],
    });
    expect(tiers[0].imageUrl).toBe("https://x/a.png");
    expect(tiers[1].imageUrl).toBe("https://x/b.png");
    expect(tiers[2].imageUrl).toBe("https://x/c.png");
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
