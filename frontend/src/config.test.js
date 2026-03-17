/**
 * Tests unitaires pour config.js (API_BASE, getAuthToken, getAuthHeaders).
 * Lancer : npm run test (dans frontend/)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { API_BASE, getAuthToken, setAuthToken, clearAuthToken, getAuthHeaders, isDevBypassPayment } from "./config.js";

describe("config", () => {
  const origLocalStorage = global.localStorage;
  const origLocation = global.location;

  beforeEach(() => {
    const store = {};
    global.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: () => null,
      length: 0,
    };
    global.location = { hostname: "localhost", origin: "http://localhost:5174" };
  });

  afterEach(() => {
    global.localStorage = origLocalStorage;
    global.location = origLocation;
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

  it("isDevBypassPayment returns boolean", () => {
    expect(typeof isDevBypassPayment()).toBe("boolean");
  });
});
