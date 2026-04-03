import { describe, it, expect, beforeEach } from "vitest";
import { applyQrThanksHero, runQrThanksHeroTransition, QR_THANKS_TITLE } from "./qr-game-hero-thanks.js";

function makeRoot() {
  const root = document.createElement("div");
  root.innerHTML = `
    <section class="fidelity-qr-hero">
      <div class="fidelity-qr-brand">
        <h1 id="fidelity-qr-hero-title" class="fidelity-qr-title fidelity-qr-title--lead">
          <span class="fidelity-qr-hero-title-inner">Participez au jeu</span>
        </h1>
        <p id="fidelity-qr-hero-success" class="fidelity-qr-hero-success"></p>
      </div>
    </section>`;
  return root;
}

describe("qr-game-hero-thanks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("applyQrThanksHero sans conteneur ne lève pas", () => {
    expect(() => applyQrThanksHero(null, () => ({}))).not.toThrow();
  });

  it("applyQrThanksHero met le libellé merci et la pastille succès", () => {
    const root = makeRoot();
    applyQrThanksHero(root, () => ({}));
    const inner = root.querySelector(".fidelity-qr-hero-title-inner");
    const h1 = root.querySelector("#fidelity-qr-hero-title");
    expect(inner?.textContent).toBe(QR_THANKS_TITLE);
    expect(h1?.classList.contains("fidelity-qr-title--thanks")).toBe(true);
    expect(root.querySelector("#fidelity-qr-hero-success")?.classList.contains("fidelity-qr-hero-success--visible")).toBe(
      true,
    );
  });

  it("runQrThanksHeroTransition en reduced motion applique sans throw", async () => {
    const root = makeRoot();
    const mq = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = globalThis.matchMedia;
    globalThis.matchMedia = () => mq;
    try {
      await runQrThanksHeroTransition(root);
      expect(root.querySelector(".fidelity-qr-hero-title-inner")?.textContent).toBe(QR_THANKS_TITLE);
    } finally {
      globalThis.matchMedia = orig;
    }
  });
});
