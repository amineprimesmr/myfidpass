/** Aligné sur Apple Wallet (cartes fidélité / magasin) : pertinence ~100 m max. */
export const LOCATION_RADIUS_MIN_M = 25;
export const LOCATION_RADIUS_MAX_M = 100;
export const LOCATION_RADIUS_DEFAULT_M = 100;

export function clampLocationRadiusMetersClient(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return LOCATION_RADIUS_DEFAULT_M;
  const stepped = Math.round(n / 5) * 5;
  return Math.min(LOCATION_RADIUS_MAX_M, Math.max(LOCATION_RADIUS_MIN_M, stepped));
}
