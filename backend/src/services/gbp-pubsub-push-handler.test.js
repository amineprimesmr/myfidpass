import { describe, it, expect } from "vitest";
import {
  normalizeGbpPubSubNotificationPayload,
  extractAccountLocationFromNotification,
} from "./gbp-pubsub-push-handler.js";

describe("gbp-pubsub-push-handler", () => {
  it("normalise les clés review / location", () => {
    const a = normalizeGbpPubSubNotificationPayload({
      type: "NEW_REVIEW",
      review_name: "accounts/1/locations/2/reviews/abc",
    });
    expect(a.type).toBe("NEW_REVIEW");
    expect(a.reviewName).toContain("reviews");
    expect(a.locationName).toBeNull();
  });

  it("extrait accountId + locationId depuis review_name", () => {
    const ids = extractAccountLocationFromNotification({
      reviewName: "accounts/108296424811540960824/locations/987654321/reviews/abc",
      locationName: null,
    });
    expect(ids).toEqual({ accountId: "108296424811540960824", locationId: "987654321" });
  });

  it("préfère location_name explicite", () => {
    const ids = extractAccountLocationFromNotification({
      reviewName: null,
      locationName: "accounts/9/locations/8",
    });
    expect(ids).toEqual({ accountId: "9", locationId: "8" });
  });
});
