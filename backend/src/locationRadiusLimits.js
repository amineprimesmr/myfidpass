/**
 * Rayon de pertinence géolocalisée (pass Apple Wallet, cartes fidélité).
 * Apple documente ~100 m pour les passes « petit rayon » (magasin, fidélité).
 */
export const LOCATION_RADIUS_MIN_M = 25;
export const LOCATION_RADIUS_MAX_M = 100;
export const LOCATION_RADIUS_DEFAULT_M = 100;

/** Valeur à enregistrer en base (null = effacer). */
export function normalizeLocationRadiusForStorage(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return LOCATION_RADIUS_DEFAULT_M;
  const stepped = Math.round(n / 5) * 5;
  return Math.min(LOCATION_RADIUS_MAX_M, Math.max(LOCATION_RADIUS_MIN_M, stepped));
}

/** Toujours un entier 25–100 pour la génération du pass. */
export function radiusMetersForPass(stored) {
  return normalizeLocationRadiusForStorage(stored) ?? LOCATION_RADIUS_DEFAULT_M;
}
