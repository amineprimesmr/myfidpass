import { describe, expect, it } from "vitest";
import {
  buildLastBroadcastFieldValue,
  invisibleBroadcastSuffix,
  normalizeChangeMessage,
} from "./broadcast-field.js";

describe("normalizeChangeMessage", () => {
  it("défaut %@ uniquement", () => {
    expect(normalizeChangeMessage("")).toBe("%@");
  });
  it("sans %@ : message seul → pas de préfixe dupliqué", () => {
    expect(normalizeChangeMessage("Allô")).toBe("%@");
  });
  it("conserve un modèle avec %@", () => {
    expect(normalizeChangeMessage("Nouveau : %@")).toBe("Nouveau : %@");
  });
});

describe("buildLastBroadcastFieldValue", () => {
  it("vide → tiret", () => {
    expect(buildLastBroadcastFieldValue("", null)).toBe("—");
  });
  it("sans suffixe si pas d’horodatage", () => {
    expect(buildLastBroadcastFieldValue("Hello", null)).toBe("Hello");
  });
  it("suffixe invisible si horodatage (unicité PassKit)", () => {
    const v = buildLastBroadcastFieldValue("Allô", "2026-03-26 21:37:21.123");
    expect(v.startsWith("Allô")).toBe(true);
    expect(v.length).toBeGreaterThan("Allô".length);
    expect(invisibleBroadcastSuffix("2026-03-26 21:37:21.123").length).toBeGreaterThan(0);
  });
});
