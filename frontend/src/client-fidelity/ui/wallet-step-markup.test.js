import { describe, expect, it } from "vitest";
import {
  renderWalletPassHeroShinyMarkup,
  renderWalletStepMarkup,
  walletStepShowsAddPassCta,
} from "./wallet-step-markup.js";

function esc(s) {
  return String(s ?? "");
}

describe("walletStepShowsAddPassCta", () => {
  it("iOS : false si PassKit a déjà enregistré le pass", () => {
    expect(
      walletStepShowsAddPassCta({ platform: "ios", appleWalletRegistered: true, hasGoogleWallet: true }),
    ).toBe(false);
  });

  it("iOS : true si pas d’enregistrement Apple", () => {
    expect(
      walletStepShowsAddPassCta({ platform: "ios", appleWalletRegistered: false, hasGoogleWallet: false }),
    ).toBe(true);
  });

  it("Android : false sans URL Google", () => {
    expect(walletStepShowsAddPassCta({ platform: "android", appleWalletRegistered: false, hasGoogleWallet: false })).toBe(
      false,
    );
  });

  it("desktop : false si Apple OK et pas de Google", () => {
    expect(
      walletStepShowsAddPassCta({ platform: "desktop", appleWalletRegistered: true, hasGoogleWallet: false }),
    ).toBe(false);
  });
});

describe("renderWalletPassHeroShinyMarkup", () => {
  it("iOS sans enregistrement : lien Apple shiny « Ajouter la carte »", () => {
    const html = renderWalletPassHeroShinyMarkup(esc, {
      platform: "ios",
      appleWalletRegistered: false,
      hasGoogleWallet: true,
    });
    expect(html).toContain("fidelity-shiny-cta");
    expect(html).toContain('id="fidelity-v2-apple"');
    expect(html).toContain("Ajouter la carte");
    expect(html).toContain("fidelity-shiny-cta__wallet-icon");
    expect(html).toContain("fidelity-cta-pill-icon");
  });

  it("desktop avec Apple et Google : deux CTA", () => {
    const html = renderWalletPassHeroShinyMarkup(esc, {
      platform: "desktop",
      appleWalletRegistered: false,
      hasGoogleWallet: true,
    });
    expect(html).toContain('id="fidelity-v2-apple"');
    expect(html).toContain('id="fidelity-v2-google"');
  });
});

describe("renderWalletStepMarkup", () => {
  it("ne rend rien sur iOS si la carte Apple est déjà enregistrée (PassKit)", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "ios",
      appleWalletRegistered: true,
      hasGoogleWallet: true,
    });
    expect(html.trim()).toBe("");
  });

  it("ne rend pas la ligne wallet si le CTA est porté par le hero (iOS sans enregistrement)", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "ios",
      appleWalletRegistered: false,
      hasGoogleWallet: true,
    });
    expect(html.trim()).toBe("");
  });

  it("sur desktop, ne duplique pas Apple/Google quand le hero les affiche", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "desktop",
      appleWalletRegistered: true,
      hasGoogleWallet: true,
    });
    expect(html.trim()).toBe("");
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
