import { describe, expect, it } from "vitest";
import {
  MERCHANT_SCAN_BENCH_PASSES,
  MERCHANT_SCAN_BENCH_POINTS,
  MERCHANT_SCAN_BENCH_MAX_BUSINESSES,
  hasMerchantScanBenchOperationalBypass,
} from "./merchant-scan-bench-access.js";

describe("hasMerchantScanBenchOperationalBypass", () => {
  it("true when scan limits are exactly 102 and 102", () => {
    expect(
      hasMerchantScanBenchOperationalBypass({
        scan_max_passes_per_member_per_day: MERCHANT_SCAN_BENCH_PASSES,
        scan_max_points_per_transaction: MERCHANT_SCAN_BENCH_POINTS,
      }),
    ).toBe(true);
  });

  it("false when limits differ or missing", () => {
    expect(hasMerchantScanBenchOperationalBypass({ scan_max_passes_per_member_per_day: 102 })).toBe(false);
    expect(
      hasMerchantScanBenchOperationalBypass({
        scan_max_passes_per_member_per_day: 0,
        scan_max_points_per_transaction: 102,
      }),
    ).toBe(false);
    expect(hasMerchantScanBenchOperationalBypass(null)).toBe(false);
  });

  it("exports max businesses for bench tier", () => {
    expect(MERCHANT_SCAN_BENCH_MAX_BUSINESSES).toBe(5);
  });
});
