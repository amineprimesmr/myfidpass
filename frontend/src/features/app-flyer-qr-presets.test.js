import { describe, it, expect } from "vitest";
import { mergeFlyerState, flyerDefaultsForTemplate, defaultFlyerState } from "./app-flyer-qr-presets.js";

describe("mergeFlyerState", () => {
  it("garde un template valide", () => {
    const s = mergeFlyerState({ templateId: "studio-clean" });
    expect(s.templateId).toBe("studio-clean");
  });

  it("remplace un template inconnu par défaut", () => {
    const s = mergeFlyerState({ templateId: "nope" });
    expect(s.templateId).toBe("noir-or-roue");
  });

  it("corrige les couleurs invalides", () => {
    const base = defaultFlyerState();
    const s = mergeFlyerState({ colorPrimary: "red", colorBgTop: "#abc" });
    expect(s.colorPrimary).toBe(base.colorPrimary);
    expect(s.colorBgTop).toBe(base.colorBgTop);
  });

  it("applique les défauts du template forêt", () => {
    const d = flyerDefaultsForTemplate("foret-jeu");
    expect(d.colorPrimary).toMatch(/^#/);
    const s = mergeFlyerState({ templateId: "foret-jeu" });
    expect(s.colorPrimary).toBe(d.colorPrimary);
  });
});
