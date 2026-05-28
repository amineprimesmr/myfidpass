import { describe, expect, it } from "vitest";
import {
  balanceUnitShort,
  deliveryReceiptStickyCtaLabel,
  deliveryReceiptSuccessMessage,
  engagementClaimSuccessMessage,
  missionRewardSnippet,
  missionsHeroCtaLabel,
} from "./program-copy.js";

describe("program-copy", () => {
  it("unité courte : points vs tampons", () => {
    expect(balanceUnitShort("points")).toBe("pts");
    expect(balanceUnitShort("stamps")).toBe("tampons");
  });

  it("missions et livraison suivent le programme", () => {
    expect(missionsHeroCtaLabel("stamps")).toBe("Gagner plus de tampons");
    expect(missionRewardSnippet("stamps")).toBe("1 tampon");
    expect(missionRewardSnippet("stamps", 15)).toBe("15 tampons");
    expect(missionRewardSnippet("points", 20)).toBe("20 points");
    expect(deliveryReceiptStickyCtaLabel("stamps")).toBe("Réclamer mes tampons");
    expect(deliveryReceiptSuccessMessage("stamps")).toBe("Tampons mis à jour.");
    expect(engagementClaimSuccessMessage("stamps")).toBe("Tampons ajoutés à ta carte.");
  });
});
