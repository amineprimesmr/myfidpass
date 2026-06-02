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

  it("Android : true même sans URL Google préchargée (hero + résolution au tap)", () => {
    expect(walletStepShowsAddPassCta({ platform: "android", appleWalletRegistered: false, hasGoogleWallet: false })).toBe(
      true,
    );
  });

  it("desktop : false si Apple OK et pas de Google", () => {
    expect(
      walletStepShowsAddPassCta({ platform: "desktop", appleWalletRegistered: true, hasGoogleWallet: false }),
    ).toBe(false);
  });
});

describe("renderWalletPassHeroShinyMarkup", () => {
  it("iOS sans enregistrement : CTA « Débloquer ma récompense »", () => {
    const html = renderWalletPassHeroShinyMarkup(esc, {
      platform: "ios",
      appleWalletRegistered: false,
      hasGoogleWallet: true,
    });
    expect(html).toContain("fidelity-shiny-cta");
    expect(html).toContain('id="fidelity-v2-apple"');
    expect(html).toContain("Débloquer ma récompense");
    expect(html).toContain("fidelity-earn-points-cta-wrap--wallet-attention");
  });

  it("Android : CTA « Débloquer ma récompense » au hero", () => {
    const html = renderWalletPassHeroShinyMarkup(esc, {
      platform: "android",
      appleWalletRegistered: false,
      hasGoogleWallet: false,
    });
    expect(html).toContain('id="fidelity-v2-google"');
    expect(html).toContain("Débloquer ma récompense");
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

  it("sur desktop avec Apple OK : rangée Google optionnelle si lien dispo", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "desktop",
      appleWalletRegistered: true,
      hasGoogleWallet: true,
    });
    expect(html).toContain('id="fidelity-v2-google"');
    expect(html).not.toContain('id="fidelity-v2-apple"');
  });

  it("sur desktop sans lien Google, ne rend rien si Apple est déjà enregistré", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "desktop",
      appleWalletRegistered: true,
      hasGoogleWallet: false,
    });
    expect(html.trim()).toBe("");
  });

  it("Android : pas de rangée wallet dupliquée — le hero porte le CTA", () => {
    const html = renderWalletStepMarkup(esc, {
      platform: "android",
      appleWalletRegistered: false,
      hasGoogleWallet: false,
    });
    expect(html.trim()).toBe("");
  });
});
