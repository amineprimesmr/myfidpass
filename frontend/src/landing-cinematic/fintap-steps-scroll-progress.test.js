import { describe, expect, it } from "vitest";
import {
  stepsIndexFromRect,
  stepsIndexFromScrollProgress,
  stepsLeftParallaxProgress,
} from "./fintap-steps-scroll-progress.js";

describe("stepsIndexFromScrollProgress", () => {
  it("aligne l’index sur la hauteur de piste (offsetHeight), pas seulement le rect", () => {
    expect(stepsIndexFromScrollProgress(0, 3000, 800, 3)).toBe(0);
    expect(stepsIndexFromScrollProgress(-1100, 3000, 800, 3)).toBe(1);
    expect(stepsIndexFromScrollProgress(-2200, 3000, 800, 3)).toBe(2);
  });

  it("réduit la hauteur « pin » quand un offset sticky (nav) est fourni", () => {
    expect(stepsIndexFromScrollProgress(-1100, 3000, 800, 3, 100)).toBe(1);
    expect(stepsIndexFromScrollProgress(-2200, 3000, 800, 3, 100)).toBe(2);
  });
});

describe("stepsIndexFromRect", () => {
  it("retourne 0 quand la section est sous le viewport", () => {
    const rect = { top: 800, height: 3000, bottom: 3800, left: 0, right: 100, width: 100, x: 0, y: 800, toJSON: () => {} };
    expect(stepsIndexFromRect(rect, 800, 3)).toBe(0);
  });

  it("monte jusqu’à l’index max quand on a scrollé la section", () => {
    const rect = { top: -2200, height: 3000, bottom: 800, left: 0, right: 100, width: 100, x: 0, y: -2200, toJSON: () => {} };
    expect(stepsIndexFromRect(rect, 800, 3)).toBe(2);
  });
});

describe("stepsLeftParallaxProgress", () => {
  it("reste dans 0–1", () => {
    const rect = { top: -500, height: 3000, bottom: 2500, left: 0, right: 100, width: 100, x: 0, y: -500, toJSON: () => {} };
    const p = stepsLeftParallaxProgress(rect, 800);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
