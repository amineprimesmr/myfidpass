import { describe, it, expect } from "vitest";
import { createPaymentClaimToken, parsePaymentClaimToken } from "./payment-claim-token.js";

describe("payment-claim-token", () => {
  it("round-trips a claim payload", () => {
    const token = createPaymentClaimToken({
      email: "test@example.com",
      sessionId: "cs_test_abc",
      establishment_name: "Café du port",
      google_place_id: "ChIJxxx",
    });
    const parsed = parsePaymentClaimToken(token);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.email).toBe("test@example.com");
      expect(parsed.payload.sessionId).toBe("cs_test_abc");
      expect(parsed.payload.establishment_name).toBe("Café du port");
    }
  });

  it("rejects tampered tokens", () => {
    const token = createPaymentClaimToken({ email: "a@b.co" });
    const parsed = parsePaymentClaimToken(`${token}x`);
    expect(parsed.ok).toBe(false);
  });
});
