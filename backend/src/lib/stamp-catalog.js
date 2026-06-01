/**
 * Clés catalogue tampons — aligné iOS/Android `StampIconCatalog`.
 * Quand le commerçant choisit une icône catalogue, l’image perso `stamp_icon` ne doit pas primer.
 */

export const STAMP_CATALOG_KEYS = new Set([
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

export function isCatalogStampSelection(raw) {
  return normalizeStampCatalogKey(raw) != null;
}

/** Image perso uniquement si pas de sélection catalogue explicite. */
export function resolveStampIconBase64ForStrip(stampEmoji, customIconBase64) {
  if (isCatalogStampSelection(stampEmoji)) return null;
  const raw = customIconBase64 == null ? "" : String(customIconBase64).trim();
  return raw || null;
}
