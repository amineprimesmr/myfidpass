import { describe, expect, it, vi } from "vitest";
import {
  buildWheelConicGradient,
  buildWheelSegmentHtml,
  DEFAULT_WHEEL_COLOR_EVEN,
  DEFAULT_WHEEL_COLOR_ODD,
  DEFAULT_WHEEL_LABELS,
  normalizeWheelLabelsFromSegments,
  pickWheelIndexForReward,
  wheelSegmentAlternateDisplayLabel,
  WHEEL_SEGMENT_COUNT,
} from "./wheel-segments.js";

function esc(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

describe("buildWheelConicGradient", () => {
  it("produit un conic-gradient pour 8 parts", () => {
    const g = buildWheelConicGradient(8);
    expect(g.startsWith("conic-gradient(")).toBe(true);
    expect(g).toContain("deg");
  });

  it("sans couleurs flyer : alterne seulement deux teintes (pas 8 pastels)", () => {
    const g = buildWheelConicGradient(8);
    expect(g.split(DEFAULT_WHEEL_COLOR_ODD).length - 1).toBeGreaterThanOrEqual(4);
    expect(g.split(DEFAULT_WHEEL_COLOR_EVEN).length - 1).toBeGreaterThanOrEqual(4);
    expect(g).not.toContain("#dbeafe");
  });
});

describe("normalizeWheelLabelsFromSegments", () => {
  it("renvoie 8 labels par défaut si vide", () => {
    expect(normalizeWheelLabelsFromSegments([]).length).toBe(WHEEL_SEGMENT_COUNT);
    expect(normalizeWheelLabelsFromSegments(null).length).toBe(WHEEL_SEGMENT_COUNT);
    expect(DEFAULT_WHEEL_LABELS.length).toBe(WHEEL_SEGMENT_COUNT);
  });

  it("étend 4 segments en 8 : parts paires = lots, impaires = PERDU", () => {
    const segs = [
      { label: "PERDU" },
      { label: "+10 pts" },
      { label: "+25 pts" },
      { label: "+50 pts" },
    ];
    expect(normalizeWheelLabelsFromSegments(segs)).toEqual([
      "+10 pts",
      "PERDU",
      "+25 pts",
      "PERDU",
      "+50 pts",
      "PERDU",
      "+10 pts",
      "PERDU",
    ]);
  });

  it("affiche les défauts en majuscules cohérentes", () => {
    expect(DEFAULT_WHEEL_LABELS.every((l) => l === l.toUpperCase())).toBe(true);
  });

  it("tronque au-delà de 8 puis alterne lot / PERDU", () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` }));
    expect(normalizeWheelLabelsFromSegments(segs)).toEqual([
      "L0",
      "PERDU",
      "L1",
      "PERDU",
      "L2",
      "PERDU",
      "L3",
      "PERDU",
    ]);
  });
});

describe("wheelSegmentAlternateDisplayLabel", () => {
  it("texte affiché sur une part perdante", () => {
    expect(wheelSegmentAlternateDisplayLabel(0)).toBe("PERDU");
    expect(wheelSegmentAlternateDisplayLabel(7)).toBe("PERDU");
  });
});

describe("buildWheelSegmentHtml", () => {
  it("alternance par index : pair = cadeau, impair = PERDU", () => {
    const win = buildWheelSegmentHtml({ segmentIndex: 0, segmentCount: 8, escapeHtml: esc });
    expect(win).toContain("fidelity-roulette-segment-gift-img");
    const lose = buildWheelSegmentHtml({ segmentIndex: 1, segmentCount: 8, escapeHtml: esc });
    expect(lose).toContain("PERDU");
    expect(lose).not.toContain("fidelity-roulette-segment-gift-img");
  });
});

describe("pickWheelIndexForReward", () => {
  it("choisit un index pair pour un lot (cohérent avec le visuel cadeau)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const labels = ["+10 pts", "PERDU", "+10 pts", "PERDU", "+10 pts", "PERDU", "+25 pts", "PERDU"];
    const idx = pickWheelIndexForReward(labels, "+10 pts");
    expect(labels[idx]).toBe("+10 pts");
    expect(idx % 2).toBe(0);
    expect([0, 2, 4].includes(idx)).toBe(true);
    vi.restoreAllMocks();
  });

  it("choisit un index impair pour PERDU", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const labels = ["+10 pts", "PERDU", "+10 pts", "PERDU", "+10 pts", "PERDU", "+10 pts", "PERDU"];
    const idx = pickWheelIndexForReward(labels, "PERDU");
    expect(labels[idx]).toBe("PERDU");
    expect(idx % 2).toBe(1);
    vi.restoreAllMocks();
  });

  it("repli sans parité si aucun index ne combine libellé et bonne parité", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const labels = ["PERDU", "+10 pts", "PERDU", "PERDU", "PERDU", "PERDU", "PERDU", "PERDU"];
    const idx = pickWheelIndexForReward(labels, "+10 pts");
    expect(labels[idx]).toBe("+10 pts");
    expect(idx).toBe(1);
    vi.restoreAllMocks();
  });

  it("libellé inconnu (API ≠ texte roue) : segment lot, jamais PERDU", () => {
    const labels = ["+10 pts", "PERDU", "+25 pts", "PERDU", "+50 pts", "PERDU", "+10 pts", "PERDU", "+25 pts"];
    const idx = pickWheelIndexForReward(labels, "réponse api différente");
    expect(idx % 2).toBe(0);
    expect(String(labels[idx]).trim().toLowerCase()).not.toBe("perdu");
  });
});
