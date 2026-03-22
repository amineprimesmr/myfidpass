import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shouldSkipTicketConsumptionForLocalDev } from "./games-helpers.js";

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
