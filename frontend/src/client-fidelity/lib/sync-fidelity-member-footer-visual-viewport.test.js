import { describe, it, expect } from "vitest";
import { computeVisualGapBottomPx } from "./sync-fidelity-member-footer-visual-viewport.js";

describe("computeVisualGapBottomPx", () => {
  it("retourne 0 si pas d’écart", () => {
    expect(computeVisualGapBottomPx({ offsetTop: 0, height: 800 }, 800)).toBe(0);
  });

  it("retourne l’espace sous le visual viewport", () => {
    expect(computeVisualGapBottomPx({ offsetTop: 0, height: 700 }, 800)).toBe(100);
  });

  it("prend en compte offsetTop", () => {
    expect(computeVisualGapBottomPx({ offsetTop: 50, height: 700 }, 800)).toBe(50);
  });
});
