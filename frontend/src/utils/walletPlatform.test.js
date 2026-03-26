import { describe, it, expect } from "vitest";
import { detectWalletPlatform } from "./walletPlatform.js";

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
