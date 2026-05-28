import { describe, it, expect } from "vitest";
import {
  EXTERNAL_ENGAGEMENT_ACTION_TYPES,
  isExternalEngagementAction,
  PENDING_CLAIM_MIN_MS,
} from "./engagement-return-flow.js";

describe("engagement-return-flow", () => {
  it("reconnaît les missions réseaux / avis externes", () => {
    expect(isExternalEngagementAction("instagram_follow")).toBe(true);
    expect(isExternalEngagementAction("trustpilot_review")).toBe(true);
    expect(isExternalEngagementAction("google_review")).toBe(false);
    expect(isExternalEngagementAction("profile_complete")).toBe(false);
  });

  it("délai retour court (pas 45 s)", () => {
    expect(PENDING_CLAIM_MIN_MS).toBeLessThanOrEqual(5_000);
    expect(EXTERNAL_ENGAGEMENT_ACTION_TYPES.size).toBeGreaterThan(5);
  });
});
