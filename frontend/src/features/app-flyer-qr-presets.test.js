import { describe, it, expect } from "vitest";
import {
  mergeFlyerState,
  defaultFlyerState,
  FLYER_TEMPLATE_ID,
  wheelSegmentColorsResolved,
  FLYER_WHEEL_SEGMENT_COUNT,
} from "./app-flyer-qr-presets.js";

describe("mergeFlyerState", () => {
  it("force le gabarit unique", () => {
    const s = mergeFlyerState({ templateId: "studio-clean" });
    expect(s.templateId).toBe(FLYER_TEMPLATE_ID);
  });

  it("normalise un template inconnu vers le gabarit unique", () => {
    const s = mergeFlyerState({ templateId: "nope" });
    expect(s.templateId).toBe(FLYER_TEMPLATE_ID);
  });

  it("corrige les couleurs invalides", () => {
    const base = defaultFlyerState();
    const s = mergeFlyerState({ colorPrimary: "red", colorBgTop: "#abc" });
    expect(s.colorPrimary).toBe(base.colorPrimary);
    expect(s.colorBgTop).toBe(base.colorBgTop);
  });

  it("résout les couleurs des parts de roue (8 secteurs)", () => {
    const s = mergeFlyerState({
      wheelSeg1: "#ff0000",
      wheelSeg3: "#00ff00",
    });
    const cols = wheelSegmentColorsResolved(s);
    expect(cols).toHaveLength(FLYER_WHEEL_SEGMENT_COUNT);
    expect(cols[0]).toBe("#ff0000");
    expect(cols[2]).toBe("#00ff00");
  });

  it("borne la rotation de découpe (°)", () => {
    expect(mergeFlyerState({ wheelSegmentOffsetDeg: 999 }).wheelSegmentOffsetDeg).toBe(180);
    expect(mergeFlyerState({ wheelSegmentOffsetDeg: -200 }).wheelSegmentOffsetDeg).toBe(-180);
    expect(mergeFlyerState({ wheelSegmentOffsetDeg: 11.234 }).wheelSegmentOffsetDeg).toBe(11.25);
  });

  it("conserve les textes et couleurs valides du stockage", () => {
    const s = mergeFlyerState({
      templateId: "foret-jeu",
      headline: "Ma accroche",
      colorPrimary: "#ff00aa",
    });
    expect(s.templateId).toBe(FLYER_TEMPLATE_ID);
    expect(s.headline).toBe("Ma accroche");
    expect(s.colorPrimary).toBe("#ff00aa");
  });
});
