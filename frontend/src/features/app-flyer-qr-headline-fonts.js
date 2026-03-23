/**
 * Polices titres flyer (Google Fonts — chargées dans index.html).
 * @typedef {{ id: string; label: string; stack: string; weight: number; style: "normal"|"italic"; tight?: boolean }} FlyerHeadlineFontDef
 */
import { FLYER_HEADLINE_FONT_ENTRIES } from "./app-flyer-qr-headline-fonts-list.js";

/** @type {readonly FlyerHeadlineFontDef[]} */
export const FLYER_HEADLINE_FONTS = FLYER_HEADLINE_FONT_ENTRIES;

const IDS = new Set(FLYER_HEADLINE_FONTS.map((f) => f.id));

/** @param {unknown} id */
export function normalizeHeadlineFontId(id) {
  const s = typeof id === "string" ? id.trim() : "";
  return IDS.has(s) ? s : FLYER_HEADLINE_FONTS[0].id;
}

/** @param {string} id */
export function flyerHeadlineFontDef(id) {
  return FLYER_HEADLINE_FONTS.find((f) => f.id === id) ?? FLYER_HEADLINE_FONTS[0];
}
