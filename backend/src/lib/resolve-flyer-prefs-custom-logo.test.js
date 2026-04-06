import { describe, expect, it } from "vitest";
import { parseFlyerPrefsCustomLogoDataUrl } from "./resolve-flyer-prefs-custom-logo.js";

describe("parseFlyerPrefsCustomLogoDataUrl", () => {
  it("returns null when missing", () => {
    expect(parseFlyerPrefsCustomLogoDataUrl(null)).toBe(null);
    expect(parseFlyerPrefsCustomLogoDataUrl("{}")).toBe(null);
  });

  it("decodes minimal PNG data URL", () => {
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const json = JSON.stringify({ custom_logo_data_url: `data:image/png;base64,${b64}` });
    const r = parseFlyerPrefsCustomLogoDataUrl(json);
    expect(r?.contentType).toBe("image/png");
    expect(r?.buffer?.length).toBeGreaterThan(20);
  });
});
