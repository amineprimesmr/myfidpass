/**
 * Tests du routeur (chemins reconnus).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoute } from "./index.js";

describe("getRoute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirige les anciennes routes de test vers 404", () => {
    vi.stubGlobal("location", {
      pathname: "/test-liquid-glass",
      search: "",
      hash: "",
    });
    expect(getRoute().type).toBe("404");
  });
});
