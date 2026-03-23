import { describe, it, expect } from "vitest";
import { mergeFlyerState, defaultFlyerState, FLYER_TEMPLATE_ID } from "./app-flyer-qr-presets.js";

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
