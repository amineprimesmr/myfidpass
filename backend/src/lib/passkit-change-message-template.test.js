import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSKIT_CHANGE_MESSAGE,
  normalizePassKitChangeMessageStored,
} from "./passkit-change-message-template.js";

describe("normalizePassKitChangeMessageStored", () => {
  it("gabarit par défaut = %@ seul", () => {
    expect(DEFAULT_PASSKIT_CHANGE_MESSAGE).toBe("%@");
  });

  it("retire le préfixe Nouveau message :", () => {
    expect(normalizePassKitChangeMessageStored("Nouveau message : %@")).toBe("%@");
    expect(normalizePassKitChangeMessageStored("NOUVEAU MESSAGE : %@")).toBe("%@");
  });

  it("conserve un gabarit custom avec %@", () => {
    expect(normalizePassKitChangeMessageStored("Promo du jour : %@")).toBe("Promo du jour : %@");
  });

  it("null si pas de %@ (pas un gabarit PassKit)", () => {
    expect(normalizePassKitChangeMessageStored("Bonjour")).toBe(null);
    expect(normalizePassKitChangeMessageStored("")).toBe(null);
  });
});
