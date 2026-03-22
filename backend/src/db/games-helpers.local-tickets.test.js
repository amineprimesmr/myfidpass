import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  shouldSkipTicketConsumptionForLocalBrowser,
  shouldSkipTicketConsumptionForLocalDev,
} from "./games-helpers.js";

function mockReq(headers) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]),
  );
  return { get: (name) => lower[String(name).toLowerCase()] };
}

describe("shouldSkipTicketConsumptionForLocalDev", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuse si le host n’est pas local", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldSkipTicketConsumptionForLocalDev("myfidpass.fr")).toBe(false);
    expect(shouldSkipTicketConsumptionForLocalDev("")).toBe(false);
  });

  it("localhost / 127.0.0.1 + hors production → true", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldSkipTicketConsumptionForLocalDev("localhost:5174")).toBe(true);
    expect(shouldSkipTicketConsumptionForLocalDev("127.0.0.1:3001")).toBe(true);
    expect(shouldSkipTicketConsumptionForLocalDev("[::1]:5174")).toBe(true);
  });

  it("localhost + NODE_ENV=production → false sauf FIDPASS_LOCAL_UNLIMITED_TICKETS=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldSkipTicketConsumptionForLocalDev("localhost:5174")).toBe(false);
    vi.stubEnv("FIDPASS_LOCAL_UNLIMITED_TICKETS", "1");
    expect(shouldSkipTicketConsumptionForLocalDev("localhost:5174")).toBe(true);
  });

  it("FIDPASS_LOCAL_UNLIMITED_TICKETS=0 → false même en dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIDPASS_LOCAL_UNLIMITED_TICKETS", "0");
    expect(shouldSkipTicketConsumptionForLocalDev("localhost:5174")).toBe(false);
  });
});

describe("shouldSkipTicketConsumptionForLocalBrowser", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Origin localhost → true en dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = mockReq({ origin: "http://localhost:5174" });
    expect(shouldSkipTicketConsumptionForLocalBrowser(req)).toBe(true);
  });

  it("Referer 127.0.0.1 → true en dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = mockReq({ referer: "http://127.0.0.1:5174/fidelity/x/jeu" });
    expect(shouldSkipTicketConsumptionForLocalBrowser(req)).toBe(true);
  });

  it("Origin localhost + prod + BLOCK → false", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIDPASS_BLOCK_LOCAL_ORIGIN_UNLIMITED_SPINS", "1");
    const req = mockReq({ origin: "http://localhost:5174" });
    expect(shouldSkipTicketConsumptionForLocalBrowser(req)).toBe(false);
  });

  it("Origin localhost + prod sans BLOCK → true", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = mockReq({ origin: "http://localhost:5174" });
    expect(shouldSkipTicketConsumptionForLocalBrowser(req)).toBe(true);
  });

  it("FIDPASS_LOCAL_UNLIMITED_TICKETS=0 → false", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIDPASS_LOCAL_UNLIMITED_TICKETS", "0");
    const req = mockReq({ origin: "http://localhost:5174" });
    expect(shouldSkipTicketConsumptionForLocalBrowser(req)).toBe(false);
  });

  it("en-tête démo + TRUST → true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIDPASS_TRUST_REMOTE_UNLIMITED_TICKETS_HEADER", "1");
    const req = mockReq({ "x-fidpass-unlimited-tickets-demo": "1" });
    expect(shouldSkipTicketConsumptionForLocalBrowser(req)).toBe(true);
  });
});
