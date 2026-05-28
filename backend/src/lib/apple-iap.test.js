import { describe, it, expect } from "vitest";
import { subscriptionStatusFromApplePayload } from "./apple-iap.js";

describe("subscriptionStatusFromApplePayload", () => {
  const now = Date.now();

  it("returns canceled when expiresDate is missing (no default active)", () => {
    expect(subscriptionStatusFromApplePayload({ originalTransactionId: "1" })).toBe("canceled");
  });

  it("returns active when subscription is in period", () => {
    const expires = now + 7 * 24 * 60 * 60 * 1000;
    expect(
      subscriptionStatusFromApplePayload({
        originalTransactionId: "1",
        expiresDate: expires,
      }),
    ).toBe("active");
  });

  it("returns canceled when subscription expired", () => {
    const expires = now - 60_000;
    expect(
      subscriptionStatusFromApplePayload({
        originalTransactionId: "1",
        expiresDate: expires,
      }),
    ).toBe("canceled");
  });
});
