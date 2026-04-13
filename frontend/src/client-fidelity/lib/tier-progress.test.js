import { describe, expect, it } from "vitest";
import { buildHeroProgressTickMarks } from "./tier-progress.js";

describe("buildHeroProgressTickMarks", () => {
  it("place chaque seuil du programme entre min et max (positions % correctes)", () => {
    const tiers = [
      { threshold: 25, label: "a" },
      { threshold: 50, label: "b" },
      { threshold: 100, label: "c" },
    ];
    const m = buildHeroProgressTickMarks(tiers, 25, 100);
    const vals = m.map((x) => x.value).sort((a, b) => a - b);
    expect(vals).toEqual([25, 50, 100]);
    const at50 = m.find((x) => x.value === 50);
    expect(at50?.leftPct).toBeCloseTo(((50 - 25) / (100 - 25)) * 100, 5);
  });

  it("segment 0→premier palier :0 et seuil cible", () => {
    const tiers = [{ threshold: 40, label: "x" }];
    const m = buildHeroProgressTickMarks(tiers, 0, 40);
    expect(m.map((x) => x.value)).toEqual([0, 40]);
  });
});
