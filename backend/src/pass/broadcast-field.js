/** Apple : changeMessage doit contenir %@ ; sans %@ on ajoute le suffixe pour préserver le préfixe commerce (ex. « Promo : %@ »). */
export function normalizeChangeMessage(customMsg) {
  const c = (customMsg || "").trim();
  if (!c) return "%@";
  if (c.includes("%@")) return c;
  return `${c} %@`;
}

/** Rend chaque envoi distinct pour PassKit (valeur du champ qui change) sans afficher date/heure au client. */
export function invisibleBroadcastSuffix(lastBroadcastAt) {
  if (lastBroadcastAt == null || String(lastBroadcastAt).trim() === "") return "";
  const s = String(lastBroadcastAt).trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const n = 1 + (h % 6);
  return "\u200B".repeat(n);
}

/**
 * Valeur du champ verso « Message » (sans date/heure visible).
 * @param {string} rawBroadcast — message brut (déjà limité côté DB)
 * @param {string | null | undefined} lastBroadcastAt — horodatage d’envoi (unicité invisible)
 */
export function buildLastBroadcastFieldValue(rawBroadcast, lastBroadcastAt) {
  if (!rawBroadcast) return "—";
  const suffix = invisibleBroadcastSuffix(lastBroadcastAt);
  const maxRaw = Math.max(0, 200 - suffix.length);
  return `${rawBroadcast.slice(0, maxRaw)}${suffix}`;
}
