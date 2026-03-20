import { describe, it, expect } from "vitest";
import { deriveCardRulesChecklistSteps } from "./app-card-rules-guide.js";

describe("deriveCardRulesChecklistSteps", () => {
  it("tampons : earn false sans libellé récompense", () => {
    const steps = deriveCardRulesChecklistSteps({
      isStamps: true,
      rewardLabelTrim: "",
      pointsPerEuro: 0,
      pointsPerVisit: 0,
      isGameMode: false,
      pointsPerTicket: 10,
      gameRewardsJsonTrim: "",
    });
    const earn = steps.find((x) => x.id === "earn");
    expect(earn?.ok).toBe(false);
  });

  it("points : earn true si points par visite > 0", () => {
    const steps = deriveCardRulesChecklistSteps({
      isStamps: false,
      rewardLabelTrim: "",
      pointsPerEuro: 0,
      pointsPerVisit: 1,
      isGameMode: false,
      pointsPerTicket: 10,
      gameRewardsJsonTrim: "",
    });
    const earn = steps.find((x) => x.id === "earn");
    expect(earn?.ok).toBe(true);
    expect(steps.some((x) => x.id === "game")).toBe(false);
  });

  it("mode jeu : game false si JSON invalide", () => {
    const steps = deriveCardRulesChecklistSteps({
      isStamps: false,
      rewardLabelTrim: "",
      pointsPerEuro: 1,
      pointsPerVisit: 0,
      isGameMode: true,
      pointsPerTicket: 5,
      gameRewardsJsonTrim: "{pas json",
    });
    const game = steps.find((x) => x.id === "game");
    expect(game?.ok).toBe(false);
  });
});
