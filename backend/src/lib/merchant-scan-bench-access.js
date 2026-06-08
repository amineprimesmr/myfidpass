import { getBusinessesByUserId } from "../db/businesses.js";

/** Plafonds scan « mode bench » — aligné iOS / Android (accès sans abo). */
export const MERCHANT_SCAN_BENCH_PASSES = 102;
export const MERCHANT_SCAN_BENCH_POINTS = 102;
/** Forfait max test bench (5 commerces — palier IAP le plus haut). */
export const MERCHANT_SCAN_BENCH_MAX_BUSINESSES = 5;

/**
 * Bench interne commerçant : plafonds scan 102 / 102 → accès opérationnel API
 * (aligné iOS `MerchantInternalBenchAccess` / Android `MerchantScanBenchAccess`).
 */
export function hasMerchantScanBenchOperationalBypass(business) {
  if (!business) return false;
  const passes = business.scan_max_passes_per_member_per_day;
  const points = business.scan_max_points_per_transaction;
  if (passes == null || points == null) return false;
  const p = Math.floor(Number(passes));
  const pts = Math.floor(Number(points));
  if (!Number.isFinite(p) || !Number.isFinite(pts)) return false;
  return p === MERCHANT_SCAN_BENCH_PASSES && pts === MERCHANT_SCAN_BENCH_POINTS;
}

/** Au moins un commerce du compte a la combinaison 102 / 102 enregistrée. */
export function userHasMerchantScanBenchAccess(userId) {
  if (!userId) return false;
  const owned = getBusinessesByUserId(userId);
  return owned.some((b) => hasMerchantScanBenchOperationalBypass(b));
}
