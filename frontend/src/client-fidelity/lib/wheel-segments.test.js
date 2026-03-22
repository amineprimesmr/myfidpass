import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WHEEL_LABELS,
  normalizeWheelLabelsFromSegments,
  pickWheelIndexForReward,
  WHEEL_SEGMENT_COUNT,
} from "./wheel-segments.js";

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

  it("tronque au-delà de 8", () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` }));
    expect(normalizeWheelLabelsFromSegments(segs)).toEqual(["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"]);
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
