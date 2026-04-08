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
