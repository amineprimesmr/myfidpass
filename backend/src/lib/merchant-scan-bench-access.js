import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { upsertMerchantEntitlement } from "../db/subscriptions.js";

const db = getDb();

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

/**
 * Au moins un commerce du compte a 102 / 102 en base.
 * Requête SQL directe — `getBusinessesByUserId` n’expose pas les colonnes scan.
 */
export function userHasMerchantScanBenchAccess(userId) {
  if (!userId) return false;
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM businesses
       WHERE user_id = ?
         AND scan_max_passes_per_member_per_day = ?
         AND scan_max_points_per_transaction = ?
       LIMIT 1`,
    )
    .get(String(userId), MERCHANT_SCAN_BENCH_PASSES, MERCHANT_SCAN_BENCH_POINTS);
  return !!row;
}

/** Après PATCH réglages scan : quota 5 commerces pour le propriétaire si 102 / 102 actif. */
export function syncBenchMerchantEntitlementForOwnerIfActive(business) {
  if (!business?.user_id) return false;
  const ownerId = String(business.user_id).trim();
  if (!ownerId) return false;
  if (!hasMerchantScanBenchOperationalBypass(business) && !userHasMerchantScanBenchAccess(ownerId)) {
    return false;
  }
  upsertMerchantEntitlement({
    userId: ownerId,
    allowedBusinesses: MERCHANT_SCAN_BENCH_MAX_BUSINESSES,
    billingProvider: "bench",
    status: "active",
    source: "bench_scan_102",
  });
  return true;
}

/** Recharge le commerce puis synchronise l’entitlement bench du propriétaire. */
export function syncBenchMerchantEntitlementAfterBusinessUpdate(businessId) {
  const id = String(businessId || "").trim();
  if (!id) return false;
  const refreshed = getBusinessById(id);
  if (!refreshed) return false;
  return syncBenchMerchantEntitlementForOwnerIfActive(refreshed);
}
