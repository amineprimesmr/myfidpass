import { describe, expect, it } from "vitest";
import { buildWorldCup2026Catalog, WORLD_CUP_2026_META } from "./world-cup-2026-catalog.js";

describe("world-cup-2026-catalog", () => {
  it("contient 72 matchs de groupes + placeholders knockout", () => {
    const catalog = buildWorldCup2026Catalog();
    const groups = catalog.filter((m) => m.stage === "group");
    const knockout = catalog.filter((m) => m.stage !== "group");
    expect(groups.length).toBe(72);
    expect(knockout.length).toBeGreaterThan(30);
    expect(catalog.length).toBe(WORLD_CUP_2026_META.total_matches);
  });

  it("match d'ouverture Mexique – Afrique du Sud", () => {
    const open = buildWorldCup2026Catalog().find((m) => m.title === "Match d'ouverture");
    expect(open?.team_home).toBe("Mexique");
    expect(open?.team_away).toBe("Afrique du Sud");
    expect(open?.predictions_open).toBe(1);
  });

  it("finale en placeholder jusqu'à sync équipes", () => {
    const final = buildWorldCup2026Catalog().find((m) => m.stage === "final");
    expect(final?.predictions_open).toBe(0);
  });
});
