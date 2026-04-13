import { describe, expect, it } from "vitest";
import { renderEarnMorePointsButtonMarkup, renderMissionsSheetMarkup } from "./missions-sheet-markup.js";

function esc(s) {
  return String(s ?? "");
}

describe("missions-sheet-markup", () => {
  it("inclut le bouton d’ouverture et les attributs d’accessibilité", () => {
    const html = renderEarnMorePointsButtonMarkup(esc);
    expect(html).toContain("fidelity-missions-sheet-open");
    expect(html).toContain('aria-controls="fidelity-missions-sheet"');
  });

  it("rend le sheet avec zone missions et feedback", () => {
    const html = renderMissionsSheetMarkup(esc, {
      engagementHtml: '<div class="x"></div>',
      sheetTitle: "Missions",
    });
    expect(html).toContain('id="fidelity-missions-sheet"');
    expect(html).toContain('id="fidelity-v2-actions"');
    expect(html).toContain("fidelity-v2-action-feedback");
  });
});
