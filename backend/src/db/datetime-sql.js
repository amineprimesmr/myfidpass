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
