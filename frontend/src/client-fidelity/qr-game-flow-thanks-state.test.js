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

  it("guestQrSpinGateSatisfied : merci hero suffit si la clé session spin gate ne persiste pas", async () => {
    const { QR_GATE_KEY, guestQrSpinGateSatisfied, markQrThanksHeroDone } = await import("./qr-game-flow.js");
    const origSetItem = sessionStorage.setItem.bind(sessionStorage);
    sessionStorage.setItem = (key, value) => {
      if (key === QR_GATE_KEY) throw new Error("quota");
      return origSetItem(key, value);
    };
    try {
      markQrThanksHeroDone("qr-demo");
      expect(sessionStorage.getItem(QR_GATE_KEY)).toBe(null);
      const guest = { email: "p@guest.invalid", id: "m1" };
      expect(guestQrSpinGateSatisfied({ member: guest }, "qr-demo")).toBe(true);
    } finally {
      sessionStorage.setItem = origSetItem;
    }
  });
});
