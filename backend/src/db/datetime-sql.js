/**
 * Horodatages UTC pour colonnes TEXT SQLite (last_broadcast_at, last_visit_at, …).
 * Précision à la milliseconde : PassKit filtre les passes avec `effectiveTs > passesUpdatedSince` ;
 * deux envois dans la même seconde laissaient le même tag → 2e notification ignorée côté iPhone.
 */

/** @param {Date | number} [d] — défaut : maintenant */
export function formatUtcSqlWithMs(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 23).replace("T", " ");
}

export function nowUtcSqlWithMs() {
  return formatUtcSqlWithMs(new Date());
}

/**
 * Ligne sous le dernier message au verso du pass (horodatage discret).
 * @param {string | null | undefined} lastBroadcastAt — SQLite « YYYY-MM-DD HH:MM:SS.mmm » ou ISO
 */
export function passMessageBroadcastFooter(lastBroadcastAt) {
  if (!lastBroadcastAt || !String(lastBroadcastAt).trim()) return "";
  try {
    const s = String(lastBroadcastAt).trim();
    const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}
