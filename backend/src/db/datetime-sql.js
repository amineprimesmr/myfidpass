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
 * Ligne affichée sous le message campagne sur le pass (verso).
 * Apple n’affiche l’alerte `changeMessage` que si la valeur du champ change : deux envois avec le même texte
 * ne produisaient aucune « notification » visible — l’instant d’envoi rend chaque mise à jour distincte.
 */
export function passMessageBroadcastFooter(lastBroadcastAt) {
  if (lastBroadcastAt == null || String(lastBroadcastAt).trim() === "") return "";
  const s = String(lastBroadcastAt).trim();
  const iso = s.replace(" ", "T").replace(/Z?$/, "Z");
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}
