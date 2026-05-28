/** Gabarit PassKit : `%@` seul → écran verrouillé = corps de campagne uniquement. */
export const DEFAULT_PASSKIT_CHANGE_MESSAGE = "%@";

/**
 * Normalise un modèle stocké en base (Ma carte / PATCH settings / avant envoi campagne).
 * @param {string | null | undefined} raw
 * @returns {string | null} `null` = effacer un texte sans `%@` (pas un gabarit PassKit).
 */
export function normalizePassKitChangeMessageStored(raw) {
  const c = (raw != null ? String(raw) : "").trim();
  if (!c) return null;
  if (!c.includes("%@")) return null;
  if (/^nouveau message\s*:/i.test(c)) return "%@";
  return c.slice(0, 200);
}
