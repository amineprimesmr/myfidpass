import { describe, it, expect } from "vitest";
import { parseFlyerSocialEntries, flyerSocialStripHeight } from "./app-flyer-social-strip.js";
import { defaultFlyerState, mergeFlyerState } from "./app-flyer-qr-presets.js";

describe("parseFlyerSocialEntries", () => {
  it("retourne vide sans config", () => {
    expect(parseFlyerSocialEntries(defaultFlyerState())).toEqual([]);
  });

  it("accepte jusqu’à 3 liens valides avec https", () => {
    const s = mergeFlyerState({
      social1: "instagram",
      socialUrl1: "https://instagram.com/cafe",
      social2: "facebook",
      socialUrl2: "https://facebook.com/page",
      social3: "twitter",
      socialUrl3: "https://x.com/foo",
    });
    const e = parseFlyerSocialEntries(s);
    expect(e).toHaveLength(3);
    expect(e[0].platform).toBe("instagram");
    expect(e[2].platform).toBe("twitter");
  });

  it("ajoute https si absent", () => {
    const s = mergeFlyerState({
      social1: "tiktok",
      socialUrl1: "www.tiktok.com/@user",
    });
    const e = parseFlyerSocialEntries(s);
    expect(e).toHaveLength(1);
    expect(e[0].url.startsWith("https://")).toBe(true);
  });

  it("ignore URL vide ou réseau inconnu", () => {
    const s = mergeFlyerState({
      social1: "instagram",
      socialUrl1: "",
      social2: "notaplatform",
      socialUrl2: "https://example.com",
    });
    expect(parseFlyerSocialEntries(s)).toEqual([]);
  });
});

describe("flyerSocialStripHeight", () => {
  it("0 si pas de réseau", () => {
    expect(flyerSocialStripHeight(1800, 0)).toBe(0);
  });

  it("positif si au moins un réseau", () => {
    expect(flyerSocialStripHeight(1800, 2)).toBeGreaterThan(0);
  });
});

