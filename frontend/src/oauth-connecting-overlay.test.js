/**
 * Tests — overlay OAuth (connexion Apple / Google).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  showOAuthConnectingOverlay,
  hideOAuthConnectingOverlay,
  handleGooglePromptMoment,
  markGoogleCredentialFlowStarted,
} from "./oauth-connecting-overlay.js";

describe("oauth-connecting-overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
  });

  afterEach(() => {
    hideOAuthConnectingOverlay();
    document.getElementById("fidpass-oauth-connecting")?.remove();
  });

  it("affiche la couche avec le titre Apple ou Google selon le fournisseur", () => {
    showOAuthConnectingOverlay("apple");
    const el = document.getElementById("fidpass-oauth-connecting");
    expect(el).toBeTruthy();
    expect(el?.hasAttribute("hidden")).toBe(false);
    expect(el?.getAttribute("aria-hidden")).toBe("false");
    expect(el?.querySelector(".fidpass-oauth-connecting__title")?.textContent).toContain("Apple");
    hideOAuthConnectingOverlay();
    showOAuthConnectingOverlay("google");
    const el2 = document.getElementById("fidpass-oauth-connecting");
    expect(el2?.querySelector(".fidpass-oauth-connecting__title")?.textContent).toContain("Google");
  });

  it("handleGooglePromptMoment masque lorsque fermé sans identifiant si le flux credential n’a pas démarré", () => {
    showOAuthConnectingOverlay("google");
    const fn = {};
    fn.isDismissedMoment = () => true;
    handleGooglePromptMoment(fn);
    const el = document.getElementById("fidpass-oauth-connecting");
    expect(el?.hasAttribute("hidden")).toBe(true);
  });

  it("ignore le moment fermé après markGoogleCredentialFlowStarted", () => {
    showOAuthConnectingOverlay("google");
    markGoogleCredentialFlowStarted();
    const fn = {};
    fn.isDismissedMoment = () => true;
    handleGooglePromptMoment(fn);
    const el = document.getElementById("fidpass-oauth-connecting");
    expect(el?.hasAttribute("hidden")).toBe(false);
  });
});
