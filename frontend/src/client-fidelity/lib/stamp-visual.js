/** Clés catalogue tampons — aligné backend `stamp-catalog.js` et apps natives. */
const STAMP_CATALOG_KEYS = new Set([
  "baguette",
  "burger",
  "cafe",
  "checkvert",
  "coiffeur",
  "croissant",
  "giftgold",
  "giftsilver",
  "kebab",
  "ongle",
  "pizza",
  "riz",
  "salade",
  "sourcil",
  "spa",
  "steak",
  "sushi",
  "iconcafe",
  "darkburger",
]);

const EMOJI_TO_CATALOG_KEY = new Map([
  ["🥖", "baguette"],
  ["🍔", "burger"],
  ["☕", "cafe"],
  ["✅", "checkvert"],
  ["💈", "coiffeur"],
  ["🥐", "croissant"],
  ["🎁", "giftgold"],
  ["🎀", "giftsilver"],
  ["🌯", "kebab"],
  ["💅", "ongle"],
  ["🍕", "pizza"],
  ["🍚", "riz"],
  ["🥗", "salade"],
  ["👁", "sourcil"],
  ["💆", "spa"],
  ["🥩", "steak"],
  ["🍣", "sushi"],
]);

/** @returns {string|null} clé PNG catalogue ou null */
export function normalizeStampCatalogKey(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (STAMP_CATALOG_KEYS.has(lower)) return lower === "iconcafe" ? "cafe" : lower;
  if (lower.startsWith("stamp") && lower.length > 5) {
    const stripped = lower.slice(5);
    if (STAMP_CATALOG_KEYS.has(stripped)) return stripped === "iconcafe" ? "cafe" : stripped;
  }
  for (const [emoji, key] of EMOJI_TO_CATALOG_KEY) {
    if (trimmed === emoji) return key;
  }
  return null;
}

function isAsciiWord(raw) {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(String(raw || "").trim());
}

/**
 * Visuel d’une cellule tampon (catalogue PNG, emoji, ou icône perso publique).
 * @param {{ stampEmoji?: string; businessSlug?: string; apiBase?: string }} p
 * @returns {{ type: "catalog" | "custom" | "emoji"; src?: string; text?: string }}
 */
export function resolveStampCellVisual(p) {
  const stampEmoji = String(p.stampEmoji ?? "✅").trim() || "✅";
  const catalogKey = normalizeStampCatalogKey(stampEmoji);
  if (catalogKey) {
    return { type: "catalog", src: `/assets/icons/${catalogKey}.png` };
  }
  if (!isAsciiWord(stampEmoji)) {
    return { type: "emoji", text: stampEmoji };
  }
  const slug = String(p.businessSlug || p.business?.slug || "").trim();
  const apiBase = String(p.apiBase || "").replace(/\/$/, "");
  if (slug) {
    return {
      type: "custom",
      src: `${apiBase}/api/businesses/${encodeURIComponent(slug)}/public/stamp-icon`,
    };
  }
  return { type: "catalog", src: "/assets/icons/checkvert.png" };
}
