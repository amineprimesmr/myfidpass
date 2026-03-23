import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FLYER_CUSTOM_LOGO_STORAGE_KEY,
  getStoredFlyerCustomLogoDataUrl,
  setStoredFlyerCustomLogoDataUrl,
  clearStoredFlyerCustomLogo,
} from "./app-flyer-logo-control.js";

describe("flyer custom logo storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lit / écrit une data URL valide", () => {
    const u = "data:image/png;base64,xx";
    setStoredFlyerCustomLogoDataUrl(u);
    expect(localStorage.getItem(FLYER_CUSTOM_LOGO_STORAGE_KEY)).toBe(u);
    expect(getStoredFlyerCustomLogoDataUrl()).toBe(u);
  });

  it("ignore une valeur non data URL", () => {
    setStoredFlyerCustomLogoDataUrl("not-an-image");
    expect(getStoredFlyerCustomLogoDataUrl()).toBe("");
  });

  it("clear supprime la clé", () => {
    setStoredFlyerCustomLogoDataUrl("data:image/png;base64,ab");
    clearStoredFlyerCustomLogo();
    expect(getStoredFlyerCustomLogoDataUrl()).toBe("");
  });
});
