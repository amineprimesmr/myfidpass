import { describe, it, expect } from "vitest";
import {
  detectWalletPlatform,
  walletCtaPillClasses,
  walletDetectHintText,
  walletFidelityBtnClasses,
} from "./walletPlatform.js";

describe("detectWalletPlatform", () => {
  it("détecte iOS (iPhone)", () => {
    expect(
      detectWalletPlatform({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      })
    ).toBe("ios");
  });

  it("détecte Android", () => {
    expect(
      detectWalletPlatform({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      })
    ).toBe("android");
  });

  it("détecte le bureau (desktop)", () => {
    expect(
      detectWalletPlatform({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      })
    ).toBe("desktop");
  });
});

describe("walletCtaPillClasses", () => {
  it("iOS : Apple en principal", () => {
    expect(walletCtaPillClasses("ios", "apple")).toContain("wallet-primary");
    expect(walletCtaPillClasses("ios", "google")).toContain("wallet-secondary");
  });

  it("Android : Google en principal", () => {
    expect(walletCtaPillClasses("android", "google")).toContain("wallet-primary");
    expect(walletCtaPillClasses("android", "apple")).toContain("wallet-secondary");
  });
});

describe("walletDetectHintText", () => {
  it("retourne un texte pour chaque plateforme", () => {
    expect(walletDetectHintText("ios").length).toBeGreaterThan(10);
    expect(walletDetectHintText("android").length).toBeGreaterThan(10);
    expect(walletDetectHintText("desktop").length).toBeGreaterThan(10);
  });
});

describe("walletFidelityBtnClasses", () => {
  it("attribue primary/secondary selon la plateforme", () => {
    const ios = walletFidelityBtnClasses("ios", "a", "g");
    expect(ios.apple).toContain("wallet-primary");
    expect(ios.google).toContain("wallet-secondary");
    const and = walletFidelityBtnClasses("android", "a", "g");
    expect(and.google).toContain("wallet-primary");
    expect(and.apple).toContain("wallet-secondary");
  });
});
