import { describe, expect, it } from "vitest";
import {
  markRewardsWalletUnlocked,
  memberRewardsUnlocked,
  readRewardsWalletUnlockedLocal,
  walletStepShowsAddPassCta,
} from "./wallet-rewards-gate.js";

describe("wallet-rewards-gate", () => {
  it("iOS : récompenses bloquées sans apple_wallet_registered", () => {
    expect(
      memberRewardsUnlocked({ member: { id: "m1" }, slug: "cafe" }, { platform: "ios" }),
    ).toBe(false);
    expect(
      memberRewardsUnlocked(
        { member: { id: "m1", apple_wallet_registered: true }, slug: "cafe" },
        { platform: "ios" },
      ),
    ).toBe(true);
  });

  it("Android : débloqué après marque locale (Google Wallet)", () => {
    const slug = "demo-android";
    const memberId = "m-android";
    markRewardsWalletUnlocked(slug, memberId);
    expect(readRewardsWalletUnlockedLocal(slug, memberId)).toBe(true);
    expect(
      memberRewardsUnlocked({ member: { id: memberId }, slug }, { platform: "android" }),
    ).toBe(true);
    expect(
      walletStepShowsAddPassCta({
        platform: "android",
        slug,
        memberId,
        appleWalletRegistered: false,
      }),
    ).toBe(false);
  });

  it("walletStepShowsAddPassCta iOS sans enregistrement", () => {
    expect(
      walletStepShowsAddPassCta({
        platform: "ios",
        appleWalletRegistered: false,
        slug: "x",
        memberId: "m",
      }),
    ).toBe(true);
  });
});
