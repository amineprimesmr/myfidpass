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

  it("slug : merci limité au commerce marké", async () => {
    vi.resetModules();
    try {
      sessionStorage.clear();
    } catch (_) {}
    const { shouldShowQrThanksHero, markQrThanksHeroDone, QR_THANKS_HERO_KEY } = await import("./qr-game-flow.js");
    markQrThanksHeroDone("café-demo");
    expect(shouldShowQrThanksHero("café-demo")).toBe(true);
    expect(shouldShowQrThanksHero("autre")).toBe(false);
    expect(sessionStorage.getItem(`${QR_THANKS_HERO_KEY}:slug:café-demo`)).toBe("1");
  });
});
