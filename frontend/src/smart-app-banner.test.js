/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncSmartAppBanner } from "./smart-app-banner.js";

describe("syncSmartAppBanner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
    try {
      localStorage.clear();
    } catch (_) {}
  });

  it("n’ajoute pas de méta hors /app ou sans token", () => {
    vi.stubGlobal("location", Object.assign(new URL("https://example.com/"), {
      ancestorOrigins: [],
      assign: () => {},
      reload: () => {},
      replace: () => {},
      toString: () => "https://example.com/",
    }));
    localStorage.setItem("fidpass_token", "t");
    syncSmartAppBanner();
    expect(document.getElementById("fidpass-smart-banner-meta")).toBeNull();

    vi.stubGlobal(
      "location",
      Object.assign(new URL("https://example.com/app"), {
        ancestorOrigins: [],
        assign: () => {},
        reload: () => {},
        replace: () => {},
        toString: () => "https://example.com/app",
      })
    );
    localStorage.removeItem("fidpass_token");
    syncSmartAppBanner();
    expect(document.getElementById("fidpass-smart-banner-meta")).toBeNull();
  });

  it("injecte apple-itunes-app sur /app avec token", () => {
    vi.stubGlobal(
      "location",
      Object.assign(new URL("https://myfidpass.fr/app"), {
        ancestorOrigins: [],
        assign: () => {},
        reload: () => {},
        replace: () => {},
        toString: () => "https://myfidpass.fr/app",
      })
    );
    localStorage.setItem("fidpass_token", "tok");
    syncSmartAppBanner();
    const meta = document.getElementById("fidpass-smart-banner-meta");
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("name")).toBe("apple-itunes-app");
    expect(meta.getAttribute("content")).toContain("app-id=6759921605");
    expect(meta.getAttribute("content")).toContain("app-argument=");
  });
});
