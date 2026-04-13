import { describe, expect, it } from "vitest";
import { buildHeroFullScaleTickMarks } from "./tier-progress.js";

describe("buildHeroFullScaleTickMarks", () => {
  it("affiche chaque palier du programme, position = valeur / dernier palier", () => {
    const tiers = [
      { threshold: 25, label: "a" },
      { threshold: 50, label: "b" },
      { threshold: 75, label: "c" },
      { threshold: 100, label: "d" },
      { threshold: 125, label: "e" },
    ];
    const m = buildHeroFullScaleTickMarks(tiers);
    expect(m.map((x) => x.value)).toEqual([25, 50, 75, 100, 125]);
    expect(m.find((x) => x.value === 25)?.leftPct).toBeCloseTo(20, 5);
    expect(m.find((x) => x.value === 125)?.leftPct).toBe(100);
  });

  it("un seul palier : 100 % à droite", () => {
    const m = buildHeroFullScaleTickMarks([{ threshold: 40, label: "x" }]);
    expect(m).toEqual([{ value: 40, leftPct: 100 }]);
  });
});
