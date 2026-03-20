import { describe, it, expect, beforeEach } from "vitest";
import {
  markAppSectionDirty,
  clearAppSectionDirty,
  isAppSectionDirty,
  registerAppExternalDirty,
} from "./app-dirty-guard.js";

describe("app-dirty-guard", () => {
  beforeEach(() => {
    clearAppSectionDirty("personnaliser");
    clearAppSectionDirty("profil");
    registerAppExternalDirty("carte-perimetre", () => false);
  });

  it("marque et efface le flag sale par section", () => {
    expect(isAppSectionDirty("personnaliser")).toBe(false);
    markAppSectionDirty("personnaliser");
    expect(isAppSectionDirty("personnaliser")).toBe(true);
    clearAppSectionDirty("personnaliser");
    expect(isAppSectionDirty("personnaliser")).toBe(false);
  });

  it("combine flag et sonde externe", () => {
    registerAppExternalDirty("carte-perimetre", () => true);
    expect(isAppSectionDirty("carte-perimetre")).toBe(true);
    registerAppExternalDirty("carte-perimetre", () => false);
    expect(isAppSectionDirty("carte-perimetre")).toBe(false);
  });
});
