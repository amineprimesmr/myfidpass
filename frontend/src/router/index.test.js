/**
 * Tests du routeur (chemins reconnus).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoute } from "./index.js";

describe("getRoute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reconnaît /test-liquid-glass", () => {
    vi.stubGlobal("location", {
      pathname: "/test-liquid-glass",
      search: "",
      hash: "",
    });
    expect(getRoute().type).toBe("liquid-glass-test");
  });
});
