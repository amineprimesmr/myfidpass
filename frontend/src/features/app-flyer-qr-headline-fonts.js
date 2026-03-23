/**
 * Polices titres flyer (Google Fonts — chargées dans index.html).
 * @typedef {{ id: string; label: string; stack: string; weight: number; style: "normal"|"italic" }} FlyerHeadlineFontDef
 */

/** @type {readonly FlyerHeadlineFontDef[]} */
export const FLYER_HEADLINE_FONTS = Object.freeze([
  {
    id: "plus-jakarta",
    label: "Plus Jakarta Sans",
    stack: `"Plus Jakarta Sans", system-ui, sans-serif`,
    weight: 800,
    style: "italic",
  },
  {
    id: "outfit",
    label: "Outfit",
    stack: `"Outfit", system-ui, sans-serif`,
    weight: 800,
    style: "normal",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    stack: `"Montserrat", system-ui, sans-serif`,
    weight: 800,
    style: "normal",
  },
  {
    id: "sora",
    label: "Sora",
    stack: `"Sora", system-ui, sans-serif`,
    weight: 700,
    style: "normal",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    stack: `"DM Sans", system-ui, sans-serif`,
    weight: 700,
    style: "normal",
  },
  {
    id: "oswald",
    label: "Oswald",
    stack: `"Oswald", system-ui, sans-serif`,
    weight: 700,
    style: "normal",
  },
  {
    id: "bebas",
    label: "Bebas Neue",
    stack: `"Bebas Neue", Impact, sans-serif`,
    weight: 400,
    style: "normal",
  },
  {
    id: "fraunces",
    label: "Fraunces (serif)",
    stack: `"Fraunces", Georgia, "Times New Roman", serif`,
    weight: 700,
    style: "normal",
  },
]);

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
