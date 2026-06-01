import { describe, it, expect } from "vitest";
import {
  isValidCheckoutSessionId,
  isValidStripeSubscriptionId,
} from "./stripe-checkout-ids.js";

describe("stripe-checkout-ids", () => {
  it("accepts checkout session ids", () => {
    expect(isValidCheckoutSessionId("cs_test_abc123")).toBe(true);
    expect(isValidCheckoutSessionId("cs_live_XyZ_01")).toBe(true);
  });

  it("rejects invalid checkout session ids", () => {
    expect(isValidCheckoutSessionId("")).toBe(false);
    expect(isValidCheckoutSessionId("pi_123")).toBe(false);
  });

  it("accepts subscription ids", () => {
    expect(isValidStripeSubscriptionId("sub_1abc")).toBe(true);
  });
});
