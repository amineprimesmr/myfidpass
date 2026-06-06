import { describe, it, expect, beforeEach, vi } from "vitest";

const GUEST = { email: "guest-abc@guest.invalid", id: "m-guest" };

describe("reconcileQrReviewClientState", () => {
  beforeEach(() => {
    vi.resetModules();
    try {
      sessionStorage.clear();
    } catch (_) {
      /* ignore */
    }
  });

  it("purge un hero Merci abandonné quand le serveur n’a pas d’avis", async () => {
    const {
      reconcileQrReviewClientState,
      shouldShowQrThanksHero,
      QR_THANKS_HERO_KEY,
      QR_GATE_KEY,
    } = await import("./qr-game-flow.js");
    sessionStorage.setItem(`${QR_THANKS_HERO_KEY}:slug:alien-burger`, "1");
    sessionStorage.setItem(QR_THANKS_HERO_KEY, "1");
    sessionStorage.setItem(QR_GATE_KEY, "1");
    expect(shouldShowQrThanksHero("alien-burger")).toBe(true);

    reconcileQrReviewClientState({ ...GUEST, google_review_engagement_done: false }, "alien-burger");

    expect(shouldShowQrThanksHero("alien-burger")).toBe(false);
    expect(sessionStorage.getItem(QR_GATE_KEY)).toBe(null);
  });

  it("conserve un hero récent après vérif locale (claim serveur en vol)", async () => {
    const { reconcileQrReviewClientState, markQrThanksHeroDone, shouldShowQrThanksHero } =
      await import("./qr-game-flow.js");
    markQrThanksHeroDone("alien-burger");

    reconcileQrReviewClientState({ ...GUEST, google_review_engagement_done: false }, "alien-burger");

    expect(shouldShowQrThanksHero("alien-burger")).toBe(true);
  });

  it("aligne hero + gate quand le serveur confirme l’avis", async () => {
    const {
      reconcileQrReviewClientState,
      shouldShowQrThanksHero,
      isQrGateUnlocked,
    } = await import("./qr-game-flow.js");

    reconcileQrReviewClientState({ ...GUEST, google_review_engagement_done: true }, "alien-burger");

    expect(shouldShowQrThanksHero("alien-burger")).toBe(true);
    expect(isQrGateUnlocked()).toBe(true);
  });

  it("isFreshGoogleReviewPending refuse un pending expiré", async () => {
    const { isFreshGoogleReviewPending, QR_GOOGLE_PENDING_KEY, QR_GOOGLE_PENDING_MAX_MS } =
      await import("./qr-game-flow.js");
    sessionStorage.setItem(QR_GOOGLE_PENDING_KEY, "1");
    sessionStorage.setItem(
      "fidelity_pending_engagement_claim",
      JSON.stringify({
        slug: "alien-burger",
        actionType: "google_review",
        ts: Date.now() - QR_GOOGLE_PENDING_MAX_MS - 1000,
      }),
    );

    expect(isFreshGoogleReviewPending("alien-burger")).toBe(false);
  });
});
