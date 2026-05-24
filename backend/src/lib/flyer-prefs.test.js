import { describe, expect, it } from "vitest";
import { normalizeFlyerPrefsPut, mergeFlyerPrefsWheelColorsFromGeneration, pickContrastingTextOnHexBg } from "./flyer-prefs.js";

describe("normalizeFlyerPrefsPut", () => {
  it("retire les clés réseaux sociaux du state", () => {
    const r = normalizeFlyerPrefsPut(
      {
        state: {
          headline: "X",
          social1: "instagram",
          socialUrl1: "https://instagram.com/x",
        },
      },
      null,
    );
    expect(r.ok).toBe(true);
    expect(r.value.state.social1).toBeUndefined();
    expect(r.value.state.socialUrl1).toBeUndefined();
    expect(r.value.state.headline).toBe("X");
  });

  it("refuse un custom_bg_data_url invalide au lieu d’écraser silencieusement le fond", () => {
    const existing = JSON.stringify({
      state: { headline: "H" },
      custom_bg_data_url: "data:image/png;base64,QUJD",
      custom_logo_data_url: null,
    });
    const r = normalizeFlyerPrefsPut(
      { custom_bg_data_url: "not-a-data-url" },
      existing,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Image de fond invalide/);
  });

  it("conserve le state existant quand le PUT envoie state: {}", () => {
    const existing = JSON.stringify({
      state: { colorBgTop: "#ff00aa", wheelColorOdd: "#112233" },
      custom_bg_data_url: null,
      custom_logo_data_url: null,
    });
    const r = normalizeFlyerPrefsPut({ state: {} }, existing);
    expect(r.ok).toBe(true);
    expect(r.value.state.colorBgTop).toBe("#ff00aa");
    expect(r.value.state.wheelColorOdd).toBe("#112233");
  });

  it("fusionne un patch partiel de state sans effacer les autres clés", () => {
    const existing = JSON.stringify({
      state: { colorBgTop: "#111111", wheelColorOdd: "#222222", headline: "Ancien" },
      custom_bg_data_url: null,
      custom_logo_data_url: null,
    });
    const r = normalizeFlyerPrefsPut({ state: { colorBgTop: "#abcdef" } }, existing);
    expect(r.ok).toBe(true);
    expect(r.value.state.colorBgTop).toBe("#abcdef");
    expect(r.value.state.wheelColorOdd).toBe("#222222");
    expect(r.value.state.headline).toBe("Ancien");
  });
});

describe("mergeFlyerPrefsWheelColorsFromGeneration", () => {
  it("aligne roue, CTA et contour CADEAU sur la couleur principale", () => {
    const merged = JSON.parse(
      mergeFlyerPrefsWheelColorsFromGeneration(null, "#ec4899", "#fef3c7"),
    );
    expect(merged.state.wheelColorOdd).toBe("#ec4899");
    expect(merged.state.wheelColorEven).toBe("#fef3c7");
    expect(merged.state.ctaBannerBgColor).toBe("#ec4899");
    expect(merged.state.ctaTextColor).toBe("#ffffff");
    expect(merged.state.headlineGiftStrokeColor).toBe("#ffffff");
  });

  it("choisit un texte foncé sur fond jaune clair", () => {
    expect(pickContrastingTextOnHexBg("#fde047")).toBe("#0f172a");
  });
});
