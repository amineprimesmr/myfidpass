import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveClientLogoImgSrc,
  resolveClientNotificationIconImgSrc,
  resolveFidelityPageBackgroundImgSrc,
} from "./resolve-client-logo-src.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveClientLogoImgSrc", () => {
  it("apiBase vide → chemin relatif (proxy Vite), ignore logoUrl absolu 127.0.0.1", () => {
    const src = resolveClientLogoImgSrc(
      { logoUrl: "http://127.0.0.1:3001/api/businesses/demo/public/logo" },
      "demo",
      "",
    );
    expect(src).toBe("/api/businesses/demo/public/flyer-qr-logo");
  });

  it("apiBase défini → préfère logoUrl API", () => {
    const src = resolveClientLogoImgSrc(
      { logoUrl: "https://api.example.com/api/businesses/x/public/flyer-qr-logo" },
      "x",
      "https://api.example.com",
    );
    expect(src).toBe("https://api.example.com/api/businesses/x/public/flyer-qr-logo");
  });

  it("ignore logoUrl Wallet (/public/logo) — force repli flyer-qr-logo", () => {
    const src = resolveClientLogoImgSrc(
      { logoUrl: "https://api.example.com/api/businesses/x/public/logo" },
      "x",
      "https://api.example.com",
    );
    expect(src).toBe("https://api.example.com/api/businesses/x/public/flyer-qr-logo");
  });

  it("hôte myfidpass.fr → chemin relatif même si apiBase pointe vers l’API (évite CORP / img cassée)", () => {
    vi.stubGlobal("location", { hostname: "www.myfidpass.fr" });
    const src = resolveClientLogoImgSrc(
      { logoUrl: "https://api.myfidpass.fr/api/businesses/x/public/flyer-qr-logo", logo_updated_at: "1" },
      "x",
      "https://api.myfidpass.fr",
    );
    expect(src.startsWith("/api/businesses/x/public/flyer-qr-logo?v=")).toBe(true);
  });

  it("cache-bust si logo_updated_at", () => {
    const src = resolveClientLogoImgSrc(
      { logo_updated_at: "2026-03-22T10:00:00.000Z" },
      "demo",
      "",
    );
    expect(src).toContain("/api/businesses/demo/public/flyer-qr-logo?v=");
    expect(src).toContain("2026-03-22");
  });

  it("cache-bust combine logo + flyer_prefs_updated_at", () => {
    const src = resolveClientLogoImgSrc(
      {
        logo_updated_at: "a",
        flyer_prefs_updated_at: "b",
      },
      "demo",
      "",
    );
    expect(src).toContain("v=a%7Cb");
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

  it("cache-bust priorise notification_icon_updated_at", () => {
    const src = resolveClientNotificationIconImgSrc(
      {
        notification_icon_updated_at: "2026-04-01T12:00:00.000Z",
        logo_updated_at: "2026-01-01T00:00:00.000Z",
      },
      "demo",
      "",
    );
    expect(src).toContain("notification-icon?v=");
    expect(src).toContain("2026-04-01");
  });
});

describe("resolveFidelityPageBackgroundImgSrc", () => {
  it("sans URL de fond dans le JSON → vide", () => {
    expect(resolveFidelityPageBackgroundImgSrc({}, "demo", "")).toBe("");
    expect(resolveFidelityPageBackgroundImgSrc({ fidelityPageBackgroundUrl: "" }, "demo", "")).toBe("");
  });

  it("apiBase vide → chemin relatif fidelity-page-background", () => {
    const src = resolveFidelityPageBackgroundImgSrc(
      {
        fidelityPageBackgroundUrl: "https://api.example.com/api/businesses/cafe/fidelity-page-background",
        fidelityPageBackgroundUpdatedAt: "2026-04-03T12:00:00.000Z",
      },
      "cafe",
      "",
    );
    expect(src.startsWith("/api/businesses/cafe/fidelity-page-background?v=")).toBe(true);
    expect(src).toContain("2026-04-03");
  });

  it("myfidpass.fr → relatif même avec apiBase API (CSS background / CORP)", () => {
    vi.stubGlobal("location", { hostname: "www.myfidpass.fr" });
    const src = resolveFidelityPageBackgroundImgSrc(
      {
        fidelityPageBackgroundUrl: "https://api.myfidpass.fr/api/businesses/x/fidelity-page-background",
        fidelityPageBackgroundUpdatedAt: "t1",
      },
      "x",
      "https://api.myfidpass.fr",
    );
    expect(src.startsWith("/api/businesses/x/fidelity-page-background?v=")).toBe(true);
  });
});
