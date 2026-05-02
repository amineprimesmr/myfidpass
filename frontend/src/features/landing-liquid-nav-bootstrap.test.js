/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { ensureLandingLiquidNav } from "./landing-liquid-nav-bootstrap.js";

describe("ensureLandingLiquidNav", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("ne lève pas lorsque le shell landing est absent", () => {
    expect(() => ensureLandingLiquidNav()).not.toThrow();
  });
});
