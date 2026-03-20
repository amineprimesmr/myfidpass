import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDefaultPointTiersBySector,
  getDefaultStampMidLabelBySector,
  getDefaultStampFinalLabelBySector,
  tiersFromApiPayload,
  readPointTierInputs,
  writePointTierInputs,
  normalizeBusinessSector,
} from "./app-card-rules-point-tiers.js";

function mountTierInputs() {
  for (let i = 0; i < 5; i++) {
    const p = document.createElement("input");
    p.id = `app-points-tier-${i}-points`;
    p.value = i === 0 ? "20" : "";
    document.body.appendChild(p);
    const l = document.createElement("input");
    l.id = `app-points-tier-${i}-label`;
    l.value = i === 0 ? "Café" : "";
    document.body.appendChild(l);
  }
}

describe("app-card-rules-point-tiers", () => {
  it("normalizeBusinessSector reconnaît fastfood et alias", () => {
    expect(normalizeBusinessSector("fastfood")).toBe("fastfood");
    expect(normalizeBusinessSector("FASTFOOD")).toBe("fastfood");
    expect(normalizeBusinessSector("fast-food")).toBe("fastfood");
    expect(normalizeBusinessSector("burger")).toBe("fastfood");
    expect(normalizeBusinessSector("inconnu")).toBe("");
  });

  it("getDefaultPointTiersBySector fastfood propose 5 paliers", () => {
    const t = getDefaultPointTiersBySector("fastfood");
    expect(t).toHaveLength(5);
    expect(t[0].points).toBe(20);
    expect(t[0].label).toMatch(/boisson/i);
  });

  it("tampons : libellés par défaut fastfood", () => {
    expect(getDefaultStampMidLabelBySector("fastfood")).toMatch(/boisson/i);
    expect(getDefaultStampFinalLabelBySector("fastfood")).toMatch(/menu|burger/i);
  });

  it("tiersFromApiPayload parse un tableau", () => {
    const t = tiersFromApiPayload([{ points: 10, label: "A" }, { points: 5, label: "B" }]);
    expect(t.map((x) => x.points)).toEqual([5, 10]);
  });

  describe("readPointTierInputs / writePointTierInputs", () => {
    beforeEach(() => {
      document.body.innerHTML = "";
      mountTierInputs();
    });
    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("lit et écrit les champs", () => {
      expect(readPointTierInputs(document).length).toBe(1);
      writePointTierInputs(document, [
        { points: 1, label: "x" },
        { points: 2, label: "y" },
      ]);
      expect(document.getElementById("app-points-tier-0-points").value).toBe("1");
      expect(document.getElementById("app-points-tier-1-label").value).toBe("y");
    });
  });
});
