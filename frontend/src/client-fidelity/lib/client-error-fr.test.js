import { describe, it, expect } from "vitest";
import { messageUtilisateurPourErreur } from "./client-error-fr.js";

describe("messageUtilisateurPourErreur", () => {
  it("traduit Failed to fetch", () => {
    const msg = messageUtilisateurPourErreur(new TypeError("Failed to fetch"));
    expect(msg).toContain("Connexion impossible");
    expect(msg).not.toMatch(/failed to fetch/i);
  });

  it("utilise le fallback si besoin", () => {
    expect(messageUtilisateurPourErreur(null, "Défaut")).toBe("Défaut");
  });

  it("laisse passer un message déjà exploitable", () => {
    expect(messageUtilisateurPourErreur(new Error("Tickets insuffisants"))).toBe("Tickets insuffisants");
  });
});
