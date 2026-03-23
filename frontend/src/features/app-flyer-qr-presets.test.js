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

  it("alterne 2 couleurs sur les 6 secteurs", () => {
    const s = mergeFlyerState({
      wheelColorOdd: "#ff0000",
      wheelColorEven: "#00ff00",
    });
    const cols = wheelSegmentColorsResolved(s);
    expect(cols).toHaveLength(FLYER_WHEEL_SEGMENT_COUNT);
    expect(cols).toEqual(["#ff0000", "#00ff00", "#ff0000", "#00ff00", "#ff0000", "#00ff00"]);
  });

  it("migre wheelSeg1/2 vers wheelColorOdd/Even si besoin", () => {
    const s = mergeFlyerState({ wheelSeg1: "#aa00aa", wheelSeg2: "#00bbbb" });
    expect(s.wheelColorOdd).toBe("#aa00aa");
    expect(s.wheelColorEven).toBe("#00bbbb");
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

  it("borne l’intensité du voile sur l’image de fond", () => {
    expect(mergeFlyerState({ flyerBgOverlayPct: -5 }).flyerBgOverlayPct).toBe(0);
    expect(mergeFlyerState({ flyerBgOverlayPct: 120 }).flyerBgOverlayPct).toBe(90);
  });

  it("retire l’ancienne clé subline du stockage", () => {
    const s = mergeFlyerState({ subline: "texte obsolète" });
    expect(Object.prototype.hasOwnProperty.call(s, "subline")).toBe(false);
  });

  it("normalise la police et les couleurs du titre", () => {
    const base = defaultFlyerState();
    expect(mergeFlyerState({ headlineFontId: "inconnue" }).headlineFontId).toBe(base.headlineFontId);
    const s = mergeFlyerState({
      headlineFontId: "bebas",
      headlineTextColor: "#aabbcc",
      headlineStrokeColor: "#010203",
      headlineStrokeWidth: 99,
      headlineLogoGapPct: 20,
      headlineLetterSpacing: 12,
    });
    expect(s.headlineFontId).toBe("bebas");
    expect(s.headlineTextColor).toBe("#aabbcc");
    expect(s.headlineStrokeColor).toBe("#010203");
    expect(s.headlineStrokeWidth).toBe(14);
    expect(s.headlineLogoGapPct).toBe(14);
    expect(s.headlineLetterSpacing).toBe(8);
  });
});
