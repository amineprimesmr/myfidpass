import { describe, expect, it } from "vitest";
import { executeMemberRewardRedeem, countSignupCycleRedemptions } from "./member-reward-redeem.js";
import { SIGNUP_REWARD_POINTS } from "./points-reward-tiers.js";

describe("executeMemberRewardRedeem signup cycle", () => {
  const business = {
    id: "biz-1",
    points_reward_tiers: JSON.stringify([
      { points: 10, label: "Boisson offerte" },
      { points: 50, label: "Menu offert" },
    ]),
    start_game_reward_label: "Boisson offerte",
    program_type: "points",
  };

  it("palier 10 pts : utilise la récompense sans vider le solde", () => {
    const member = { id: "mem-1", points: 10 };
    const result = executeMemberRewardRedeem(business, member, {
      mode: "points",
      tierIndex: 0,
      points: SIGNUP_REWARD_POINTS,
      source: "test",
    });
    expect(result.ok).toBe(true);
    expect(result.points_deducted).toBe(0);
    expect(result.new_points).toBe(10);
    expect(result.signup_cycle).toBe(true);
  });

  it("palier 50 pts : déduit normalement les points", () => {
    const member = { id: "mem-2", points: 55 };
    const result = executeMemberRewardRedeem(business, member, {
      mode: "points",
      tierIndex: 1,
      points: 50,
      source: "test",
    });
    expect(result.ok).toBe(true);
    expect(result.points_deducted).toBe(50);
    expect(result.new_points).toBe(5);
  });
});

describe("countSignupCycleRedemptions", () => {
  it("est une fonction exportée", () => {
    expect(typeof countSignupCycleRedemptions).toBe("function");
  });
});
