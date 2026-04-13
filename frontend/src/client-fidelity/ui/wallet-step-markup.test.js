import { describe, expect, it } from "vitest";
import { renderWalletStepMarkup } from "./wallet-step-markup.js";

function esc(s) {
  return String(s ?? "");
}

describe("renderWalletStepMarkup", () => {
  it("ne rend rien sur iOS si la carte Apple est déjà enregistrée (PassKit)", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "ios",
      appleWalletRegistered: true,
      hasGoogleWallet: true,
    });
    expect(html.trim()).toBe("");
  });

  it("affiche encore Apple sur iOS si pas d’enregistrement PassKit", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "ios",
      appleWalletRegistered: false,
      hasGoogleWallet: true,
    });
    expect(html).toContain("fidelity-v2-apple");
  });

  it("sur desktop, masque Apple si enregistré et garde Google si disponible", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "desktop",
      appleWalletRegistered: true,
      hasGoogleWallet: true,
    });
    expect(html).toContain("fidelity-v2-google");
    expect(html).not.toContain("fidelity-v2-apple");
  });

  it("sur desktop sans lien Google, ne rend rien si Apple est déjà enregistré", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "desktop",
      appleWalletRegistered: true,
      hasGoogleWallet: false,
    });
    expect(html.trim()).toBe("");
  });
});
