import { afterEach, describe, expect, it, vi } from "vitest";
import {
  businessHasFlyerCustomLogo,
  resolveClientLogoImgSrc,
  resolveClientNotificationIconImgSrc,
  resolveClientWalletLogoImgSrc,
  resolveFidelityPageBackgroundImgSrc,
} from "./resolve-client-logo-src.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("businessHasFlyerCustomLogo", () => {
  it("lit has_flyer_custom_logo depuis l’API", () => {
    expect(businessHasFlyerCustomLogo({ has_flyer_custom_logo: true })).toBe(true);
    expect(businessHasFlyerCustomLogo({ has_flyer_custom_logo: false })).toBe(false);
  });
});

describe("resolveClientLogoImgSrc", () => {
  it("sans flyer → logo carte (/public/logo)", () => {
    const src = resolveClientLogoImgSrc({ has_flyer_custom_logo: false, logo_updated_at: "1" }, "demo", "");
    expect(src).toBe("/api/businesses/demo/public/logo?v=1");
  });

  it("avec flyer → flyer-qr-logo", () => {
    const src = resolveClientLogoImgSrc(
      { has_flyer_custom_logo: true, flyer_prefs_updated_at: "f1" },
      "demo",
      "",
    );
    expect(src).toBe("/api/businesses/demo/public/flyer-qr-logo?v=f1");
  });

  it("apiBase vide → chemin relatif, ignore logoUrl absolu wallet si flyer attendu", () => {
    const src = resolveClientLogoImgSrc(
      {
        has_flyer_custom_logo: true,
        logoUrl: "http://127.0.0.1:3001/api/businesses/demo/public/logo",
      },
      "demo",
      "",
    );
    expect(src).toBe("/api/businesses/demo/public/flyer-qr-logo");
  });

  it("apiBase défini → préfère logoUrl API flyer", () => {
    const src = resolveClientLogoImgSrc(
      {
        has_flyer_custom_logo: true,
        logoUrl: "https://api.example.com/api/businesses/x/public/flyer-qr-logo",
      },
      "x",
      "https://api.example.com",
    );
    expect(src).toBe("https://api.example.com/api/businesses/x/public/flyer-qr-logo");
  });

  it("hôte myfidpass.fr → chemin relatif (évite CORP)", () => {
    vi.stubGlobal("location", { hostname: "www.myfidpass.fr" });
    const src = resolveClientLogoImgSrc(
      {
        has_flyer_custom_logo: false,
        logoUrl: "https://api.myfidpass.fr/api/businesses/x/public/logo",
        logo_updated_at: "1",
      },
      "x",
      "https://api.myfidpass.fr",
    );
    expect(src.startsWith("/api/businesses/x/public/logo?v=")).toBe(true);
  });
});

describe("resolveClientWalletLogoImgSrc", () => {
  it("pointe toujours vers /public/logo", () => {
    expect(resolveClientWalletLogoImgSrc({ logo_updated_at: "z" }, "cafe", "")).toBe(
      "/api/businesses/cafe/public/logo?v=z",
    );
  });
});

describe("resolveClientNotificationIconImgSrc", () => {
  it("apiBase vide → chemin relatif vers notification-icon", () => {
    const src = resolveClientNotificationIconImgSrc(
      { notificationIconUrl: "http://127.0.0.1:3001/api/businesses/demo/notification-icon" },
      "demo",
      "",
    );
    expect(src).toBe("/api/businesses/demo/notification-icon");
  });

  it("sans notificationIconUrl → vide", () => {
    expect(resolveClientNotificationIconImgSrc({ logo_updated_at: "2026-01-01T00:00:00.000Z" }, "demo", "")).toBe(
      "",
    );
  });
});

describe("resolveFidelityPageBackgroundImgSrc", () => {
  it("sans URL de fond dans le JSON → vide", () => {
    expect(resolveFidelityPageBackgroundImgSrc({}, "demo", "")).toBe("");
  });
});
