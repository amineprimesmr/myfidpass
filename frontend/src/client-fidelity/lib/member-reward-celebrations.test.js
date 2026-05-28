import { describe, expect, it } from "vitest";
import {
  buildCelebrationQueue,
  findNewlyUnlockedTiers,
  getStartingRewardOffer,
} from "./member-reward-celebrations.js";

describe("member-reward-celebrations", () => {
  it("getStartingRewardOffer utilise le 1er palier", () => {
    const offer = getStartingRewardOffer(
      {
        points_reward_tiers: [{ points: 10, label: "Café offert" }],
      },
      "points",
    );
    expect(offer.label).toBe("Café offert");
    expect(offer.threshold).toBe(10);
    expect(offer.costLine).toBe("10 points");
  });

  it("findNewlyUnlockedTiers détecte le franchissement", () => {
    const tiers = [
      { threshold: 10, label: "A" },
      { threshold: 20, label: "B" },
    ];
    expect(findNewlyUnlockedTiers(tiers, 5, 15).map((t) => t.threshold)).toEqual([10]);
    expect(findNewlyUnlockedTiers(tiers, 10, 25).map((t) => t.threshold)).toEqual([20]);
  });

  it("buildCelebrationQueue : bienvenue puis palier sans doublon 1er palier", () => {
    const queue = buildCelebrationQueue({
      slug: "demo",
      memberId: "m1",
      business: {
        welcome_bonus_enabled: 1,
        welcome_bonus_amount: 10,
        points_reward_tiers: [{ points: 10, label: "Café" }],
      },
      member: { id: "m1", points: 10 },
      programType: "points",
      previousBalance: 0,
      storage: { welcomeShown: false, tiers: [] },
      welcomeBonusJustGranted: { type: "points", amount: 10 },
    });
    expect(queue[0].kind).toBe("welcome");
    expect(queue.some((q) => q.kind === "tier_unlocked" && q.threshold === 10)).toBe(false);
  });

  it("buildCelebrationQueue : palier atteint après progression", () => {
    const queue = buildCelebrationQueue({
      slug: "demo",
      memberId: "m1",
      business: {
        points_reward_tiers: [
          { points: 10, label: "A" },
          { points: 20, label: "B" },
        ],
      },
      member: { id: "m1", points: 20 },
      programType: "points",
      previousBalance: 12,
      storage: { welcomeShown: true, tiers: [10] },
      welcomeBonusJustGranted: null,
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("tier_unlocked");
    expect(queue[0].threshold).toBe(20);
  });
});
