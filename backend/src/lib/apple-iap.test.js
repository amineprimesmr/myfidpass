import { describe, it, expect } from "vitest";
import {
  subscriptionStatusFromApplePayload,
  expiresMsFromApplePayload,
} from "./apple-iap-status.js";

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

  it("accepts expires_date snake_case and ISO-8601 strings", () => {
    const future = new Date(now + 86400000).toISOString();
    expect(
      subscriptionStatusFromApplePayload({
        originalTransactionId: "1",
        expires_date: future,
      }),
    ).toBe("active");
    expect(expiresMsFromApplePayload({ expires_date: future })).toBeGreaterThan(now);
  });
});
