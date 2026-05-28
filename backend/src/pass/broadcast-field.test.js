import { describe, expect, it } from "vitest";
import {
  buildBroadcastUniquenessSuffix,
  buildLastBroadcastFieldValue,
  normalizeChangeMessage,
} from "./broadcast-field.js";

describe("normalizeChangeMessage", () => {
  it("défaut %@ uniquement", () => {
    expect(normalizeChangeMessage("")).toBe("%@");
  });
  it("sans %@ : ajoute le placeholder après le texte commerce", () => {
    expect(normalizeChangeMessage("Allô")).toBe("Allô %@");
  });
  it("conserve un modèle avec %@", () => {
    expect(normalizeChangeMessage("Nouveau : %@")).toBe("Nouveau : %@");
  });
  it("évite la duplication quand le modèle recopie le message diffusé (sans %@)", () => {
    expect(normalizeChangeMessage("G La dalle", "G La dalle")).toBe("%@");
  });
  it("évite Allo + Allô (modèle périmètre vs corps campagne, accents)", () => {
    expect(normalizeChangeMessage("Allo", "Allô")).toBe("%@");
  });
});

describe("buildBroadcastUniquenessSuffix", () => {
  it("vide → chaîne vide", () => {
    expect(buildBroadcastUniquenessSuffix("", null, 0)).toBe("");
  });
  it("toujours non vide avec message + seq par défaut", () => {
    expect(buildBroadcastUniquenessSuffix("Hello", null, undefined).length).toBeGreaterThan(0);
  });
});

describe("buildLastBroadcastFieldValue", () => {
  it("vide → tiret", () => {
    expect(buildLastBroadcastFieldValue("", null)).toBe("—");
  });
  it("suffixe d’unicité même sans horodatage (empreinte contenu + seq)", () => {
    const v = buildLastBroadcastFieldValue("Hello", null);
    expect(v.startsWith("Hello")).toBe(true);
    expect(v.length).toBeGreaterThan("Hello".length);
  });
  it("horodatage + empreinte + seq (unicité PassKit)", () => {
    const v = buildLastBroadcastFieldValue("Allô", "2026-03-26 21:37:21.123");
    expect(v.startsWith("Allô")).toBe(true);
    expect(v.length).toBeGreaterThan("Allô".length);
  });
  it("même texte + même date : compteur d’envoi rend la valeur distincte (ré-envois identiques)", () => {
    const t = "Promo flash";
    const at = "2026-03-26 21:37:21.123";
    const a = buildLastBroadcastFieldValue(t, at, 1);
    const b = buildLastBroadcastFieldValue(t, at, 2);
    expect(a).not.toBe(b);
    expect(a.startsWith("Promo flash")).toBe(true);
    expect(b.startsWith("Promo flash")).toBe(true);
  });
  it("texte différent → valeur différente (empreinte contenu + pipeline identique)", () => {
    const at = "2026-03-26 21:37:21.123";
    const a = buildLastBroadcastFieldValue("Message A", at, 5);
    const b = buildLastBroadcastFieldValue("Message B", at, 5);
    expect(a).not.toBe(b);
  });
  it("chaque envoi : suffixe visible ·seq pour alerte Wallet", () => {
    expect(buildLastBroadcastFieldValue("Promo", "2026-03-26 21:37:21.123", 1).startsWith("Promo·1")).toBe(true);
    expect(buildLastBroadcastFieldValue("Promo", "2026-03-26 21:37:21.123", 2).startsWith("Promo·2")).toBe(true);
  });
});
