import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WHEEL_LABELS,
  formatWheelSegmentDisplayLabel,
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

  it("affiche les défauts en majuscules cohérentes", () => {
    expect(DEFAULT_WHEEL_LABELS.every((l) => l === l.toUpperCase())).toBe(true);
  });

  it("tronque au-delà de 8", () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` }));
    expect(normalizeWheelLabelsFromSegments(segs)).toEqual(["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"]);
  });
});

describe("formatWheelSegmentDisplayLabel", () => {
  it("raccourcit les libellés points longs en majuscules", () => {
    expect(formatWheelSegmentDisplayLabel("10 POINTS BONUS")).toBe("+10 PTS");
    expect(formatWheelSegmentDisplayLabel("25 points bonus")).toBe("+25 PTS");
    expect(formatWheelSegmentDisplayLabel("50 PTS")).toBe("+50 PTS");
  });

  it("perdant / pas de lot → PERDU", () => {
    expect(formatWheelSegmentDisplayLabel("")).toBe("PERDU");
    expect(formatWheelSegmentDisplayLabel("PERDU")).toBe("PERDU");
    expect(formatWheelSegmentDisplayLabel("PAS DE LOT")).toBe("PERDU");
  });

  it("normalise les courts en majuscules", () => {
    expect(formatWheelSegmentDisplayLabel("+10 pts")).toBe("+10 PTS");
  });

  it("tampons ou passages → affichage PTS sur la roue", () => {
    expect(formatWheelSegmentDisplayLabel("+2 tampons")).toBe("+2 PTS");
    expect(formatWheelSegmentDisplayLabel("3 passages")).toBe("+3 PTS");
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
