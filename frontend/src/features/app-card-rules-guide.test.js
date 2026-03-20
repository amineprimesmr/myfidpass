import { describe, it, expect } from "vitest";
import { deriveCardRulesChecklistSteps } from "./app-card-rules-guide.js";

describe("deriveCardRulesChecklistSteps", () => {
  it("tampons : earn false sans libellé récompense", () => {
    const steps = deriveCardRulesChecklistSteps({
      isStamps: true,
      rewardLabelTrim: "",
      pointTierFilledCount: 0,
    });
    const earn = steps.find((x) => x.id === "earn");
    expect(earn?.ok).toBe(false);
  });

  it("points : earn toujours ok (économie gérée côté serveur / champs masqués)", () => {
    const steps = deriveCardRulesChecklistSteps({
      isStamps: false,
      rewardLabelTrim: "",
      pointTierFilledCount: 0,
    });
    const earn = steps.find((x) => x.id === "earn");
    expect(earn?.ok).toBe(true);
    expect(steps.some((x) => x.id === "game")).toBe(false);
  });

  it("points : paliers optionnels — tiers ok si au moins une ligne", () => {
    const steps = deriveCardRulesChecklistSteps({
      isStamps: false,
      rewardLabelTrim: "",
      pointTierFilledCount: 2,
    });
    const tiers = steps.find((x) => x.id === "tiers");
    expect(tiers?.ok).toBe(true);
  });
});
