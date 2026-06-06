import { describe, it, expect, vi } from "vitest";

vi.mock("../db/connection.js", () => ({
  getDb: () => ({
    prepare: () => ({
      get: () => ({ n: 0 }),
      all: () => [],
    }),
  }),
}));
vi.mock("../db/businesses.js", () => ({
  getBusinessById: () => null,
}));
vi.mock("./signup-reward-label.js", () => ({
  resolveSignupRewardLabelForBusiness: () => "",
}));

import {
  memberCrossedRewardUnlocked,
  memberHasRewardReady,
  memberIsPointsNearReward,
  isBirthdayTodayInMerchantTz,
} from "./member-campaign-segments.js";

describe("member-campaign-segments", () => {
  const stampsBusiness = {
    id: "b1",
    program_type: "stamps",
    required_stamps: 10,
    stamp_mid_reward_label: "Café offert",
    stamp_reward_label: "Menu offert",
  };

  const pointsBusiness = {
    id: "b2",
    program_type: "points",
    points_reward_tiers: JSON.stringify([
      { points: 10, label: "Bienvenue" },
      { points: 50, label: "Dessert" },
      { points: 100, label: "Menu" },
    ]),
  };

  it("memberHasRewardReady — tampons cycle complet", () => {
    expect(memberHasRewardReady(stampsBusiness, { points: 10 })).toBe(true);
    expect(memberHasRewardReady(stampsBusiness, { points: 5 })).toBe(true);
    expect(memberHasRewardReady(stampsBusiness, { points: 3 })).toBe(false);
  });

  it("memberIsPointsNearReward — tampons proche du palier", () => {
    expect(memberIsPointsNearReward(stampsBusiness, { points: 8 })).toBe(true);
    expect(memberIsPointsNearReward(stampsBusiness, { points: 2 })).toBe(false);
  });

  it("memberCrossedRewardUnlocked — points franchit palier 50", () => {
    expect(memberCrossedRewardUnlocked(pointsBusiness, 40, 55)).toBe(true);
    expect(memberCrossedRewardUnlocked(pointsBusiness, 55, 60)).toBe(false);
  });

  it("memberCrossedRewardUnlocked — tampons franchit mi-parcours", () => {
    expect(memberCrossedRewardUnlocked(stampsBusiness, 4, 5)).toBe(true);
  });

  it("isBirthdayTodayInMerchantTz compare mois-jour Paris", () => {
    const fixed = new Date("2026-06-06T10:00:00Z");
    expect(isBirthdayTodayInMerchantTz("1990-06-06", fixed, "Europe/Paris")).toBe(true);
    expect(isBirthdayTodayInMerchantTz("1990-06-07", fixed, "Europe/Paris")).toBe(false);
  });
});
