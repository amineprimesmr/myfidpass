import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClientLogoImgSrc, resolveClientNotificationIconImgSrc } from "./resolve-client-logo-src.js";

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
    expect(src).toBe("/api/businesses/demo/public/logo");
  });

  it("apiBase défini → préfère logoUrl API", () => {
    const src = resolveClientLogoImgSrc(
      { logoUrl: "https://api.example.com/api/businesses/x/public/logo" },
      "x",
      "https://api.example.com",
    );
    expect(src).toBe("https://api.example.com/api/businesses/x/public/logo");
  });

  it("hôte myfidpass.fr → chemin relatif même si apiBase pointe vers l’API (évite CORP / img cassée)", () => {
    vi.stubGlobal("location", { hostname: "www.myfidpass.fr" });
    const src = resolveClientLogoImgSrc(
      { logoUrl: "https://api.myfidpass.fr/api/businesses/x/public/logo", logo_updated_at: "1" },
      "x",
      "https://api.myfidpass.fr",
    );
    expect(src.startsWith("/api/businesses/x/public/logo?v=")).toBe(true);
  });

  it("cache-bust si logo_updated_at", () => {
    const src = resolveClientLogoImgSrc(
      { logo_updated_at: "2026-03-22T10:00:00.000Z" },
      "demo",
      "",
    );
    expect(src).toContain("/api/businesses/demo/public/logo?v=");
    expect(src).toContain("2026-03-22");
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
