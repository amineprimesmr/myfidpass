import { describe, expect, it } from "vitest";
import {
  buildHeroLinearTickMarks,
  heroFillPercentLinear,
  parsePointTiers,
  buildStampTiers,
  SIGNUP_REWARD_POINTS,
  STAMP_START_GAME_THRESHOLD,
} from "./tier-progress.js";

describe("buildHeroLinearTickMarks", () => {
  it("origine 0 + paliers au prorata des points", () => {
    const tiers = [
      { threshold: 10, label: "a" },
      { threshold: 50, label: "b" },
      { threshold: 100, label: "c" },
    ];
    const m = buildHeroLinearTickMarks(tiers);
    expect(m[0]).toEqual({ value: 0, leftPct: 0 });
    expect(m.find((x) => x.value === 10)?.leftPct).toBe(10);
    expect(m.find((x) => x.value === 50)?.leftPct).toBe(50);
    expect(m.find((x) => x.value === 100)?.leftPct).toBe(100);
  });
});

describe("parsePointTiers signup tier", () => {
  it("réinjecte 10 pts si absent", () => {
    const tiers = parsePointTiers({
      signup_reward_label: "Boisson offerte",
      points_reward_tiers: [{ points: 50, label: "Dessert" }],
    });
    expect(tiers[0].threshold).toBe(SIGNUP_REWARD_POINTS);
    expect(tiers[0].label).toBe("Boisson offerte");
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

describe("heroFillPercentLinear", () => {
  it("progression proportionnelle 0 → dernier palier", () => {
    const tiers = [
      { threshold: 10, label: "a" },
      { threshold: 100, label: "b" },
    ];
    expect(heroFillPercentLinear(tiers, 0)).toBe(0);
    expect(heroFillPercentLinear(tiers, 10)).toBe(10);
    expect(heroFillPercentLinear(tiers, 50)).toBe(50);
    expect(heroFillPercentLinear(tiers, 100)).toBe(100);
  });
});

describe("buildStampTiers", () => {
  it("inclut la récompense début du jeu", () => {
    const tiers = buildStampTiers({
      required_stamps: 10,
      start_game_reward_label: "Boisson offerte",
      stamp_mid_reward_label: "Dessert offert",
      stamp_reward_label: "Menu offert",
    });
    expect(tiers[0].threshold).toBe(STAMP_START_GAME_THRESHOLD);
    expect(tiers[0].label).toBe("Boisson offerte");
    expect(tiers.some((t) => t.threshold === 5)).toBe(true);
  });
});
