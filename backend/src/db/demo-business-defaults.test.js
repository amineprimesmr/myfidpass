import { describe, it, expect } from "vitest";
import { DEMO_POINTS_REWARD_TIERS_JSON, DEMO_ENGAGEMENT_REWARDS_JSON } from "./demo-business-defaults.js";

describe("demo-business-defaults", () => {
  it("exporte des paliers points JSON valides", () => {
    const tiers = JSON.parse(DEMO_POINTS_REWARD_TIERS_JSON);
    expect(Array.isArray(tiers)).toBe(true);
    expect(tiers.length).toBeGreaterThanOrEqual(3);
    expect(tiers[0]).toHaveProperty("points");
    expect(tiers[0]).toHaveProperty("label");
  });

  it("active toutes les missions d’engagement", () => {
    const e = JSON.parse(DEMO_ENGAGEMENT_REWARDS_JSON);
    expect(e.google_review.enabled).toBe(true);
    expect(String(e.google_review.place_id || "").length).toBeGreaterThan(5);
    for (const key of [
      "instagram_follow",
      "tiktok_follow",
      "facebook_follow",
      "twitter_follow",
      "trustpilot_review",
      "tripadvisor_review",
    ]) {
      expect(e[key]?.enabled).toBe(true);
      expect(String(e[key]?.url || "").startsWith("http")).toBe(true);
    }
  });
});
