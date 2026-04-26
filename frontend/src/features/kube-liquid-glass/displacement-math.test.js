import { describe, it, expect } from "vitest";
import { SurfaceEquations, calculateDisplacementMap1D } from "./displacement-math.js";

describe("displacement-math (kube)", () => {
  it("convex_squircle vaut 0 au bord et 1 établi au centre de la bordure (x→1)", () => {
    const f = SurfaceEquations.convex_squircle;
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
  });

  it("calculateDisplacementMap1D retourne 128 échantillons", () => {
    const pre = calculateDisplacementMap1D(100, 20, SurfaceEquations.convex_squircle, 1.5, 128);
    expect(pre.length).toBe(128);
    const m = Math.max(...pre.map((x) => Math.abs(x)));
    expect(m).toBeGreaterThan(0);
  });
});
