import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Merci hero — persistance rendu", () => {
  beforeEach(() => {
    vi.resetModules();
    try {
      sessionStorage.clear();
    } catch (_) {
      /* ignore */
    }
  });

  it("shouldShowQrThanksHero reflète markQrThanksHeroDone", async () => {
    const { shouldShowQrThanksHero, markQrThanksHeroDone, QR_THANKS_HERO_KEY } = await import("./qr-game-flow.js");
    expect(shouldShowQrThanksHero()).toBe(false);
    markQrThanksHeroDone();
    expect(shouldShowQrThanksHero()).toBe(true);
    expect(sessionStorage.getItem(QR_THANKS_HERO_KEY)).toBe("1");
  });
});
