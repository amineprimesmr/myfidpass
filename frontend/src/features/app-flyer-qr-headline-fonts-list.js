/**
 * Polices d’affichage / titrage (display & editorial), pas des grotesques de texte courant.
 * Références : familles « display » et serifs à fort contraste adaptés aux gros titres (Google Fonts).
 * @type {readonly { id: string; label: string; stack: string; weight: number; style: "normal"|"italic"; tight?: boolean }[]}
 */
export const FLYER_HEADLINE_FONT_ENTRIES = Object.freeze([
  { id: "fraunces", label: "Fraunces — serif display organique", stack: `"Fraunces", Georgia, serif`, weight: 700, style: "normal" },
  { id: "abril-fatface", label: "Abril Fatface — serif Didone poster", stack: `"Abril Fatface", Georgia, serif`, weight: 400, style: "normal" },
  { id: "playfair", label: "Playfair Display — serif rédaction luxe", stack: `"Playfair Display", Georgia, serif`, weight: 700, style: "normal" },
  { id: "dm-serif-display", label: "DM Serif Display — serif contraste (titres)", stack: `"DM Serif Display", Georgia, serif`, weight: 400, style: "normal" },
  { id: "bodoni-moda", label: "Bodoni Moda — serif mode / magazine", stack: `"Bodoni Moda", "Bodoni MT", Georgia, serif`, weight: 700, style: "normal" },
  { id: "yeseva-one", label: "Yeseva One — serif display élégant", stack: `"Yeseva One", Georgia, serif`, weight: 400, style: "normal" },
  { id: "cinzel", label: "Cinzel — capitales impériales", stack: `"Cinzel", Georgia, serif`, weight: 700, style: "normal" },
  { id: "bebas", label: "Bebas Neue — poster tout en hauteur", stack: `"Bebas Neue", Impact, sans-serif`, weight: 400, style: "normal", tight: true },
  { id: "anton", label: "Anton — sans ultra noir (affiche)", stack: `"Anton", Impact, sans-serif`, weight: 400, style: "normal", tight: true },
  { id: "archivo-black", label: "Archivo Black — sans géométrique massif", stack: `"Archivo Black", Impact, sans-serif`, weight: 400, style: "normal", tight: true },
  { id: "oswald", label: "Oswald — condensé éditorial", stack: `"Oswald", Impact, sans-serif`, weight: 700, style: "normal", tight: true },
  { id: "saira-extra-condensed", label: "Saira Extra Condensed — narrow impact", stack: `"Saira Extra Condensed", "Arial Narrow", sans-serif`, weight: 800, style: "normal", tight: true },
  { id: "teko", label: "Teko — condensé sport / signalétique", stack: `"Teko", Impact, sans-serif`, weight: 600, style: "normal", tight: true },
  { id: "alfa-slab", label: "Alfa Slab One — slab poster", stack: `"Alfa Slab One", Georgia, serif`, weight: 400, style: "normal" },
  { id: "ultra", label: "Ultra — slab western display", stack: `"Ultra", Georgia, serif`, weight: 400, style: "normal" },
  { id: "bungee", label: "Bungee — display urbain vertical", stack: `"Bungee", Impact, sans-serif`, weight: 400, style: "normal" },
  { id: "righteous", label: "Righteous — rétro arrondi annonces", stack: `"Righteous", system-ui, sans-serif`, weight: 400, style: "normal" },
  { id: "paytone-one", label: "Paytone One — sans ronde affiche", stack: `"Paytone One", system-ui, sans-serif`, weight: 400, style: "normal" },
  { id: "russo-one", label: "Russo One — sans technique carré", stack: `"Russo One", system-ui, sans-serif`, weight: 400, style: "normal" },
  { id: "shrikhand", label: "Shrikhand — display latine expressive", stack: `"Shrikhand", Georgia, serif`, weight: 400, style: "normal" },
  { id: "titan-one", label: "Titan One — sans bulle / promo", stack: `"Titan One", system-ui, sans-serif`, weight: 400, style: "normal" },
  { id: "unbounded", label: "Unbounded — géométrique display récent", stack: `"Unbounded", system-ui, sans-serif`, weight: 700, style: "normal" },
]);
