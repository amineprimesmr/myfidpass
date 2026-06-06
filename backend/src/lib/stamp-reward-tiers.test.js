import { describe, expect, it } from "vitest";
import {
  findNewlyUnlockedStampRewardTiers,
  pickStampUnlockNotificationLabel,
  STAMP_MID_DEFAULT,
} from "./stamp-reward-tiers.js";

describe("findNewlyUnlockedStampRewardTiers", () => {
  const business = {
    required_stamps: 10,
    stamp_mid_reward_label: "Dessert offert",
    stamp_reward_label: "Menu offert",
  };

  it("détecte le palier intermédiaire (5 tampons)", () => {
    const unlocked = findNewlyUnlockedStampRewardTiers(business, 3, 5);
    expect(unlocked).toEqual([{ threshold: STAMP_MID_DEFAULT, label: "Dessert offert" }]);
  });

  it("détecte la carte complète (10e tampon)", () => {
    const unlocked = findNewlyUnlockedStampRewardTiers(business, 9, 10);
    expect(unlocked.some((t) => t.label === "Menu offert")).toBe(true);
  });

  it("priorise le libellé le plus élevé pour la notif", () => {
    const unlocked = findNewlyUnlockedStampRewardTiers(business, 4, 10);
    expect(pickStampUnlockNotificationLabel(unlocked)).toBe("Menu offert");
  });
});
