/**
 * 15 polices titre au rendu très différent (évite les doublons « grotesques »).
 * Chargement : index.html (Google Fonts).
 * @type {readonly { id: string; label: string; stack: string; weight: number; style: "normal"|"italic"; tight?: boolean }[]}
 */
export const FLYER_HEADLINE_FONT_ENTRIES = Object.freeze([
  { id: "plus-jakarta", label: "Plus Jakarta Sans — italique expressif", stack: `"Plus Jakarta Sans", system-ui, sans-serif`, weight: 800, style: "italic" },
  { id: "dm-sans", label: "DM Sans — géométrique sobre", stack: `"DM Sans", system-ui, sans-serif`, weight: 700, style: "normal" },
  { id: "space-grotesk", label: "Space Grotesk — tech / startup", stack: `"Space Grotesk", system-ui, sans-serif`, weight: 700, style: "normal" },
  { id: "anton", label: "Anton — ultra noir large", stack: `"Anton", Impact, sans-serif`, weight: 400, style: "normal", tight: true },
  { id: "bebas", label: "Bebas Neue — poster haut & étroit", stack: `"Bebas Neue", Impact, sans-serif`, weight: 400, style: "normal", tight: true },
  { id: "oswald", label: "Oswald — condensé industriel", stack: `"Oswald", Impact, sans-serif`, weight: 700, style: "normal", tight: true },
  { id: "teko", label: "Teko — condensé anguleux", stack: `"Teko", Impact, sans-serif`, weight: 600, style: "normal", tight: true },
  { id: "orbitron", label: "Orbitron — sci-fi / futuriste", stack: `"Orbitron", system-ui, sans-serif`, weight: 700, style: "normal" },
  { id: "syne", label: "Syne — contemporain décalé", stack: `"Syne", system-ui, sans-serif`, weight: 800, style: "normal" },
  { id: "righteous", label: "Righteous — rétro arrondi", stack: `"Righteous", system-ui, sans-serif`, weight: 400, style: "normal" },
  { id: "bungee", label: "Bungee — display massif", stack: `"Bungee", Impact, sans-serif`, weight: 400, style: "normal" },
  { id: "fredoka", label: "Fredoka — ronde & conviviale", stack: `"Fredoka", system-ui, sans-serif`, weight: 700, style: "normal" },
  { id: "playfair", label: "Playfair Display — serif chic", stack: `"Playfair Display", Georgia, serif`, weight: 700, style: "normal" },
  { id: "fraunces", label: "Fraunces — serif chaleureuse", stack: `"Fraunces", Georgia, serif`, weight: 700, style: "normal" },
  { id: "cinzel", label: "Cinzel — capitales classiques", stack: `"Cinzel", Georgia, serif`, weight: 700, style: "normal" },
]);
