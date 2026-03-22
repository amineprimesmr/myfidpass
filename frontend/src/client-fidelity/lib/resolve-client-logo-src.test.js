import { describe, expect, it } from "vitest";
import { resolveClientLogoImgSrc } from "./resolve-client-logo-src.js";

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
