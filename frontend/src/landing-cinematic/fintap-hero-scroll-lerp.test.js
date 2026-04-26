import { describe, expect, it } from "vitest";
import {
  clamp,
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatio,
  fintapHeroScrollRatioFromViewport,
  lerp,
} from "./fintap-hero-scroll-lerp.js";

describe("fintapHeroScrollRatioFromViewport", () => {
  it("0 quand la section n’a pas bougé (viewport)", () => {
    expect(fintapHeroScrollRatioFromViewport(200, 200, 400)).toBe(0);
  });
  it("0.5 après 200px de défilement (section monte)", () => {
    expect(fintapHeroScrollRatioFromViewport(200, 0, 400)).toBe(0.5);
  });
  it("1 après 400px (section monte de 400px en coordonnées vues)", () => {
    expect(fintapHeroScrollRatioFromViewport(400, 0, 400)).toBe(1);
  });
  it("plafonne", () => {
    expect(fintapHeroScrollRatioFromViewport(0, -1000, 400)).toBe(1);
  });
});

describe("fintapHeroScrollRatio", () => {
  it("retourne 0 en haut de section", () => {
    expect(fintapHeroScrollRatio(0, 0, 400)).toBe(0);
  });
  it("vaut 1 au bout de 400px de scroll après le haut de section", () => {
    expect(fintapHeroScrollRatio(1500, 1000, 400)).toBe(1);
  });
  it("plafonne le ratio à 1", () => {
    expect(fintapHeroScrollRatio(5_000, 0, 400)).toBe(1);
  });
  it("plafonne le ratio à 0", () => {
    expect(fintapHeroScrollRatio(0, 500, 400)).toBe(0);
  });
});

describe("computeFintapHeroPhoneStyle", () => {
  it("raccorde l’état initial (ratio 0) : contre-plongée, zoom + fort", () => {
    const s = computeFintapHeroPhoneStyle(0);
    expect(s.rotateX).toBe(32);
    expect(s.rotateY).toBe(0);
    expect(s.rotateZ).toBe(0);
    expect(s.scale).toBe(1.45);
    expect(s.translateY).toBe(-64);
    expect(s.topGap).toBe(8);
  });
  it("raccorde l’état final (ratio 1)", () => {
    const s = computeFintapHeroPhoneStyle(1);
    expect(s.rotateX).toBe(0);
    expect(s.rotateY).toBe(0);
    expect(s.rotateZ).toBe(0);
    expect(s.scale).toBe(1);
    expect(s.translateY).toBe(0);
    expect(s.shadowAlpha).toBeCloseTo(0.12);
    expect(s.topGap).toBe(48);
  });
});

describe("utilitaires", () => {
  it("lerp", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  it("clamp", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
  });
});
