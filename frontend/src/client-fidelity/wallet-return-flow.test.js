import { describe, it, expect } from "vitest";
import {
  APPLE_WALLET_PENDING_KEY,
  WALLET_REGISTRATION_POLL_MS,
  consumeWalletHeroReveal,
  scheduleWalletHeroReveal,
} from "./wallet-return-flow.js";

describe("wallet-return-flow", () => {
  it("expose les clés session et plusieurs polls PassKit", () => {
    expect(APPLE_WALLET_PENDING_KEY).toBe("fidelity_apple_wallet_pending");
    expect(WALLET_REGISTRATION_POLL_MS.length).toBeGreaterThan(3);
  });

  it("hero reveal flag consommable une fois", () => {
    scheduleWalletHeroReveal();
    expect(consumeWalletHeroReveal()).toBe(true);
    expect(consumeWalletHeroReveal()).toBe(false);
  });
});
