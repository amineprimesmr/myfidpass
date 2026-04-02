import { describe, expect, it, vi } from "vitest";
import {
  buildWheelSegmentHtml,
  DEFAULT_WHEEL_LABELS,
  normalizeWheelLabelsFromSegments,
  pickWheelIndexForReward,
  wheelSegmentAlternateDisplayLabel,
  WHEEL_SEGMENT_COUNT,
  WHEEL_SEGMENT_GIFT_IMG_SRC,
} from "./wheel-segments.js";

function esc(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

describe("normalizeWheelLabelsFromSegments", () => {
  it("renvoie 8 labels par défaut si vide", () => {
    expect(normalizeWheelLabelsFromSegments([]).length).toBe(WHEEL_SEGMENT_COUNT);
    expect(normalizeWheelLabelsFromSegments(null).length).toBe(WHEEL_SEGMENT_COUNT);
    expect(DEFAULT_WHEEL_LABELS.length).toBe(WHEEL_SEGMENT_COUNT);
  });

  it("étend 4 segments en 8 par cycle", () => {
    const segs = [
      { label: "PERDU" },
      { label: "+10 pts" },
      { label: "+25 pts" },
      { label: "+50 pts" },
    ];
    expect(normalizeWheelLabelsFromSegments(segs)).toEqual([
      "PERDU",
      "+10 pts",
      "+25 pts",
      "+50 pts",
      "PERDU",
      "+10 pts",
      "+25 pts",
      "+50 pts",
    ]);
  });

  it("affiche les défauts en majuscules cohérentes", () => {
    expect(DEFAULT_WHEEL_LABELS.every((l) => l === l.toUpperCase())).toBe(true);
  });

  it("tronque au-delà de 8", () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` }));
    expect(normalizeWheelLabelsFromSegments(segs)).toEqual(["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"]);
  });
});

describe("wheelSegmentAlternateDisplayLabel", () => {
  it("alterne GAGNER / PERDU selon l’index (0 = GAGNER)", () => {
    expect(wheelSegmentAlternateDisplayLabel(0)).toBe("GAGNER");
    expect(wheelSegmentAlternateDisplayLabel(1)).toBe("PERDU");
    expect(wheelSegmentAlternateDisplayLabel(2)).toBe("GAGNER");
    expect(wheelSegmentAlternateDisplayLabel(3)).toBe("PERDU");
    expect(wheelSegmentAlternateDisplayLabel(7)).toBe("PERDU");
  });
});

describe("buildWheelSegmentHtml", () => {
  it("affiche l’image cadeau sur les parts paires (GAGNER) et le texte sur PERDU", () => {
    const win = buildWheelSegmentHtml({ segmentIndex: 0, segmentCount: 8, escapeHtml: esc });
    expect(win).toContain(`${WHEEL_SEGMENT_GIFT_IMG_SRC}?v=4`);
    expect(win).toContain("fidelity-roulette-segment-gift-img");
    const lose = buildWheelSegmentHtml({ segmentIndex: 1, segmentCount: 8, escapeHtml: esc });
    expect(lose).toContain("PERDU");
    expect(lose).not.toContain("fidelity-roulette-segment-gift-img");
  });
});

describe("pickWheelIndexForReward", () => {
  it("choisit un index parmi les libellés identiques", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const labels = ["PERDU", "+10 pts", "PERDU", "+10 pts", "+10 pts", "PERDU", "+10 pts", "PERDU"];
    const idx = pickWheelIndexForReward(labels, "+10 pts");
    expect(labels[idx]).toBe("+10 pts");
    expect([1, 3, 4, 6].includes(idx)).toBe(true);
    vi.restoreAllMocks();
  });
});
