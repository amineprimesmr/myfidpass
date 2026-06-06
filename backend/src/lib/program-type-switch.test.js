import { describe, it, expect } from "vitest";
import {
  applyProgramTypeSwitchSideEffects,
  computeWelcomeStampGrantAmount,
} from "./program-type-switch.js";

describe("applyProgramTypeSwitchSideEffects", () => {
  const baseBusiness = {
    id: "b1",
    program_type: "points",
    required_stamps: 10,
    points_per_euro: "1",
    points_per_visit: "0",
    welcome_bonus_amount: 10,
    welcome_bonus_enabled: 1,
  };

  it("points → tampons : bonus bienvenue = 1, tiers et fond points conservés en base", () => {
    const updates = { program_type: "stamps" };
    const r = applyProgramTypeSwitchSideEffects(baseBusiness, updates, {});
    expect(r.switched).toBe(true);
    expect(r.prevType).toBe("points");
    expect(r.nextType).toBe("stamps");
    expect(updates.welcome_bonus_amount).toBe(1);
    expect(updates.points_reward_tiers).toBeUndefined();
    expect(updates.card_background_base64).toBeUndefined();
    expect(updates.loyalty_mode).toBe("points_cash");
  });

  it("tampons → points : bonus bienvenue = 10 par défaut", () => {
    const updates = { program_type: "points" };
    const business = { ...baseBusiness, program_type: "stamps", welcome_bonus_amount: 1 };
    const r = applyProgramTypeSwitchSideEffects(business, updates, {});
    expect(r.switched).toBe(true);
    expect(updates.welcome_bonus_amount).toBe(10);
  });

  it("ne change rien si le mode est identique", () => {
    const updates = { program_type: "points" };
    const r = applyProgramTypeSwitchSideEffects(baseBusiness, updates, {});
    expect(r.switched).toBe(false);
  });

  it("respecte welcome_bonus_amount explicite dans le body", () => {
    const updates = { program_type: "stamps" };
    applyProgramTypeSwitchSideEffects(baseBusiness, updates, { welcome_bonus_amount: 2 });
    expect(updates.welcome_bonus_amount).toBeUndefined();
  });
});

describe("computeWelcomeStampGrantAmount", () => {
  it("legacy welcome_bonus_amount=10 → 1 tampon (plus de floor(cycle/2)=5)", () => {
    expect(computeWelcomeStampGrantAmount(10, 10)).toBe(1);
  });

  it("bonus configuré à 1 → 1 tampon", () => {
    expect(computeWelcomeStampGrantAmount(1, 10)).toBe(1);
  });

  it("ne dépasse pas la taille du cycle", () => {
    expect(computeWelcomeStampGrantAmount(3, 2)).toBe(2);
  });
});
