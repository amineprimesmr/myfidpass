import { describe, it, expect } from "vitest";
import { parseGooglePlaceIdFromEngagementRewardsJson } from "./business-place-ids.js";

describe("parseGooglePlaceIdFromEngagementRewardsJson", () => {
  it("extrait place_id depuis engagement_rewards", () => {
    const json = JSON.stringify({
      google_review: { place_id: "ChIJabc", points: 1 },
    });
    expect(parseGooglePlaceIdFromEngagementRewardsJson(json)).toBe("ChIJabc");
  });

  it("retourne chaîne vide si JSON invalide ou absent", () => {
    expect(parseGooglePlaceIdFromEngagementRewardsJson("")).toBe("");
    expect(parseGooglePlaceIdFromEngagementRewardsJson(null)).toBe("");
    expect(parseGooglePlaceIdFromEngagementRewardsJson("{")).toBe("");
  });
});
