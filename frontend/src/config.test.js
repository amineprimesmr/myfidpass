/**
 * Tests unitaires pour config.js (API_BASE, getAuthToken, getAuthHeaders).
 * Lancer : npm run test (dans frontend/)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  API_BASE,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getAuthHeaders,
  buildStripeSaasPaymentUrl,
  buildStripeAnnualPaymentUrl,
  subscriptionUsesExternalStripePaymentLink,
  isSaasPaymentEmbeddedInNativeApp,
  consumeAuthTransferFromHash,
  buildPaymentPathWithAuthHandoff,
} from "./config.js";

describe("config", () => {
  const origLocalStorage = globalThis.localStorage;
  const origLocation = globalThis.location;
  const origHistory = globalThis.history;

  beforeEach(() => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: () => null,
      length: 0,
    };
    globalThis.location = { hostname: "localhost", origin: "http://localhost:5174" };
  });

  afterEach(() => {
    globalThis.localStorage = origLocalStorage;
    globalThis.location = origLocation;
    globalThis.history = origHistory;
  });

  it("getAuthToken returns null when empty", () => {
    expect(getAuthToken()).toBeNull();
  });

  it("setAuthToken and getAuthToken roundtrip", () => {
    setAuthToken("abc123");
    expect(getAuthToken()).toBe("abc123");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it("getAuthHeaders includes Authorization when token set", () => {
    setAuthToken("token");
    const h = getAuthHeaders();
    expect(h.Authorization).toBe("Bearer token");
  });

  it("getAuthHeaders does not include Authorization when no token", () => {
    clearAuthToken();
    const h = getAuthHeaders();
    expect(h.Authorization).toBeUndefined();
  });

  it("API_BASE is string", () => {
    expect(typeof API_BASE).toBe("string");
  });

  it("buildStripeSaasPaymentUrl includes prefilled_promo_code", () => {
    const u = buildStripeSaasPaymentUrl();
    expect(u).toContain("prefilled_promo_code=MYFID1EURO");
    expect(u.startsWith("https://buy.stripe.com/")).toBe(true);
  });

  it("buildStripeSaasPaymentUrl adds prefilled_email when provided", () => {
    const u = buildStripeSaasPaymentUrl("  test@example.com  ");
    expect(u).toContain("prefilled_email=test%40example.com");
  });

  it("buildStripeAnnualPaymentUrl returns the annual Payment Link", () => {
    const u = buildStripeAnnualPaymentUrl();
    expect(u.startsWith("https://buy.stripe.com/fZufZh7bjbjEeCR4Cr8Zq03")).toBe(true);
  });

  it("subscriptionUsesExternalStripePaymentLink is true on SaaS web (Payment Link)", () => {
    globalThis.location = {
      hostname: "myfidpass.fr",
      origin: "https://www.myfidpass.fr",
      pathname: "/app",
      search: "",
      hash: "",
    };
    expect(subscriptionUsesExternalStripePaymentLink()).toBe(true);
  });

  it("subscriptionUsesExternalStripePaymentLink is false in iOS embed (?app_embed=1)", () => {
    globalThis.location = {
      hostname: "myfidpass.fr",
      origin: "https://www.myfidpass.fr",
      pathname: "/paiement",
      search: "?app_embed=1",
      hash: "",
    };
    expect(isSaasPaymentEmbeddedInNativeApp()).toBe(true);
    expect(subscriptionUsesExternalStripePaymentLink()).toBe(false);
  });

  it("consumeAuthTransferFromHash imports fid_auth and clears hash from URL", () => {
    clearAuthToken();
    let replacedUrl = "";
    globalThis.history = {
      replaceState(_a, _b, url) {
        replacedUrl = url;
      },
    };
    const jwt = "eyJ.part.sig";
    globalThis.location = {
      hostname: "myfidpass.fr",
      origin: "https://myfidpass.fr",
      pathname: "/paiement",
      search: "",
      hash: `#fid_auth=${encodeURIComponent(jwt)}`,
    };
    expect(consumeAuthTransferFromHash()).toBe(true);
    expect(getAuthToken()).toBe(jwt);
    expect(replacedUrl).toBe("/paiement");
  });

  it("buildPaymentPathWithAuthHandoff appends encoded fragment when token set", () => {
    setAuthToken("tok.ab.cd");
    const p = buildPaymentPathWithAuthHandoff("/paiement");
    expect(p.startsWith("/paiement#fid_auth=")).toBe(true);
    expect(p).toContain(encodeURIComponent("tok.ab.cd"));
    clearAuthToken();
    expect(buildPaymentPathWithAuthHandoff("/paiement")).toBe("/paiement");
  });
});
