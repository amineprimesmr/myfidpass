import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { scrollProgressThroughSection } from "./fintap-testimonials-scroll.js";

describe("scrollProgressThroughSection", () => {
  beforeEach(() => {
    vi.stubGlobal("innerHeight", 800);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retourne 0 sans élément", () => {
    expect(scrollProgressThroughSection(null)).toBe(0);
  });

  it("retourne une valeur entre 0 et 1 pour un rect plausible", () => {
    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top: 400,
      height: 600,
      left: 0,
      width: 100,
      bottom: 1000,
      right: 100,
      x: 0,
      y: 400,
      toJSON: () => {},
    });
    const p = scrollProgressThroughSection(el);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
