import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDefaultPointTiersBySector,
  getDefaultStampMidLabelBySector,
  getDefaultStampFinalLabelBySector,
  tiersFromApiPayload,
  readPointTierInputs,
  writePointTierInputs,
  removePointTierInput,
  syncPointTierOptionalRowVisibility,
  normalizeBusinessSector,
  DEFAULT_REWARD_EXAMPLE_TIERS,
  POINT_TIER_COUNT,
} from "./app-card-rules-point-tiers.js";

function mountTierInputs() {
  for (let i = 0; i < POINT_TIER_COUNT; i++) {
    const row = document.createElement("div");
    row.id = `app-points-tier-row-${i}`;
    document.body.appendChild(row);
    const p = document.createElement("input");
    p.id = `app-points-tier-${i}-points`;
    p.value = i === 0 ? "10" : "";
    document.body.appendChild(p);
    const l = document.createElement("input");
    l.id = `app-points-tier-${i}-label`;
    l.value = i === 0 ? "Café" : "";
    document.body.appendChild(l);
  }
  const addBtn = document.createElement("button");
  addBtn.id = "app-points-tier-add";
  document.body.appendChild(addBtn);
}

describe("app-card-rules-point-tiers", () => {
  it("normalizeBusinessSector reconnaît fastfood et alias", () => {
    expect(normalizeBusinessSector("fastfood")).toBe("fastfood");
    expect(normalizeBusinessSector("FASTFOOD")).toBe("fastfood");
    expect(normalizeBusinessSector("fast-food")).toBe("fastfood");
    expect(normalizeBusinessSector("burger")).toBe("fastfood");
    expect(normalizeBusinessSector("inconnu")).toBe("");
  });

  it("getDefaultPointTiersBySector renvoie les exemples fixes", () => {
    const t = getDefaultPointTiersBySector("fastfood");
    expect(t).toHaveLength(5);
    expect(t).toEqual(DEFAULT_REWARD_EXAMPLE_TIERS);
    expect(t[0].points).toBe(10);
    expect(t[0].label).toMatch(/boisson/i);
    expect(getDefaultPointTiersBySector("inconnu")).toEqual(DEFAULT_REWARD_EXAMPLE_TIERS);
  });

  it("tampons : libellés d’exemple fixes", () => {
    expect(getDefaultStampMidLabelBySector("fastfood")).toBe("Dessert offert");
    expect(getDefaultStampFinalLabelBySector("cafe")).toBe("Menu offert");
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
        { points: 10, label: "x" },
        { points: 250, label: "y" },
      ]);
      expect(document.getElementById("app-points-tier-0-points").value).toBe("10");
      expect(document.getElementById("app-points-tier-1-points").value).toBe("250");
      expect(document.getElementById("app-points-tier-1-label").value).toBe("y");
    });

    it("removePointTierInput remonte les paliers suivants", () => {
      writePointTierInputs(document, [
        { points: 10, label: "a" },
        { points: 50, label: "b" },
        { points: 250, label: "c" },
      ]);
      removePointTierInput(document, 1);
      expect(document.getElementById("app-points-tier-1-points").value).toBe("250");
      expect(document.getElementById("app-points-tier-1-label").value).toBe("c");
    });

    it("syncPointTierOptionalRowVisibility affiche les lignes remplies", () => {
      writePointTierInputs(document, [
        { points: 10, label: "a" },
        { points: 50, label: "b" },
        { points: 100, label: "c" },
        { points: 150, label: "d" },
        { points: 200, label: "e" },
        { points: 250, label: "f" },
      ]);
      syncPointTierOptionalRowVisibility(document);
      expect(document.getElementById("app-points-tier-row-5").classList.contains("hidden")).toBe(false);
    });
  });
});
