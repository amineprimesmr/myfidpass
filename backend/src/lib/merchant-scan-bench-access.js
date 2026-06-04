/**
 * Bench interne commerçant : plafonds scan 2 / 2 → accès opérationnel API
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
  return p === 2 && pts === 2;
}
