/**
 * Tests : parsing session Stripe, viewport, résolution lien store.
 */
import { describe, it, expect } from "vitest";
import {
  parseCheckoutSessionId,
  resolveNativeAppStoreUrl,
} from "./post-purchase-app-modal.js";

describe("post-purchase-app-modal", () => {
  it("parseCheckoutSessionId accepts valid Stripe session id", () => {
    expect(parseCheckoutSessionId("?session_id=cs_test_abc123")).toBe("cs_test_abc123");
    expect(parseCheckoutSessionId("session_id=cs_live_XyZ_01")).toBe("cs_live_XyZ_01");
  });

  it("parseCheckoutSessionId rejects invalid values", () => {
    expect(parseCheckoutSessionId("?session_id=")).toBeNull();
    expect(parseCheckoutSessionId("?session_id=evil")).toBeNull();
    expect(parseCheckoutSessionId("")).toBeNull();
  });

  it("resolveNativeAppStoreUrl prefers platform-specific env URLs", () => {
    expect(
      resolveNativeAppStoreUrl({
        iosUrl: "https://apps.apple.com/app/id1",
        androidUrl: "https://play.google.com/store/apps/details?id=x",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      })
    ).toBe("https://apps.apple.com/app/id1");

    expect(
      resolveNativeAppStoreUrl({
        iosUrl: "https://apps.apple.com/app/id1",
        androidUrl: "https://play.google.com/store/apps/details?id=x",
        userAgent: "Mozilla/5.0 (Linux; Android 14)",
      })
    ).toBe("https://play.google.com/store/apps/details?id=x");
  });

  it("resolveNativeAppStoreUrl falls back to single configured URL", () => {
    expect(
      resolveNativeAppStoreUrl({
        iosUrl: "https://apps.apple.com/app/id1",
        androidUrl: "",
        userAgent: "Linux Android",
      })
    ).toBe("https://apps.apple.com/app/id1");
  });

  it("resolveNativeAppStoreUrl uses public search when no URL configured", () => {
    expect(
      resolveNativeAppStoreUrl({
        iosUrl: "",
        androidUrl: "",
        userAgent: "iPhone",
      })
    ).toMatch(/^https:\/\/apps\.apple\.com\//);

    expect(
      resolveNativeAppStoreUrl({
        iosUrl: "",
        androidUrl: "",
        userAgent: "Android",
      })
    ).toMatch(/^https:\/\/play\.google\.com\//);
  });
});
