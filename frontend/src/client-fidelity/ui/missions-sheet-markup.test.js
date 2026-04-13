import { describe, expect, it } from "vitest";
import { renderEarnMorePointsButtonMarkup, renderMissionsSheetMarkup } from "./missions-sheet-markup.js";

function esc(s) {
  return String(s ?? "");
}

describe("missions-sheet-markup", () => {
  it("inclut le bouton d’ouverture et les attributs d’accessibilité", () => {
    const html = renderEarnMorePointsButtonMarkup(esc);
    expect(html).toContain("fidelity-missions-sheet-open");
    expect(html).toContain("fidelity-shiny-cta");
    expect(html).toContain("fidelity-shiny-cta--missions-gift");
    expect(html).toContain("fidelity-shiny-cta__gift-emoji");
    expect(html).toContain("\u{1F381}");
    expect(html).toContain('aria-controls="fidelity-missions-sheet"');
    expect(html).toContain("Gagner plus de points");
  });

  it("CTA tampons si programme tampons", () => {
    const html = renderEarnMorePointsButtonMarkup(esc, "stamps");
    expect(html).toContain("Gagner plus de tampons");
  });

  it("rend le sheet avec zone missions et feedback", () => {
    const html = renderMissionsSheetMarkup(esc, {
      engagementHtml: '<div class="x"></div>',
      sheetTitle: "Missions",
    });
    expect(html).toContain('id="fidelity-missions-sheet"');
    expect(html).toContain('id="fidelity-v2-actions"');
    expect(html).toContain("fidelity-v2-action-feedback");
    expect(html).toContain("premier tour de roue");
    expect(html).toContain("points sur ta carte");
  });

  it("sous-titre tampons si programme tampons", () => {
    const html = renderMissionsSheetMarkup(esc, {
      engagementHtml: "",
      sheetTitle: "Missions",
      programType: "stamps",
    });
    expect(html).toContain("premier tour de roue");
    expect(html).toContain("tampons sur ta carte");
  });
});
