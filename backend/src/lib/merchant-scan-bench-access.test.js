import { describe, expect, it } from "vitest";
import { hasMerchantScanBenchOperationalBypass } from "./merchant-scan-bench-access.js";

describe("hasMerchantScanBenchOperationalBypass", () => {
  it("true when scan limits are exactly 2 and 2", () => {
    expect(
      hasMerchantScanBenchOperationalBypass({
        scan_max_passes_per_member_per_day: 2,
        scan_max_points_per_transaction: 2,
      }),
    ).toBe(true);
  });

  it("false when limits differ or missing", () => {
    expect(hasMerchantScanBenchOperationalBypass({ scan_max_passes_per_member_per_day: 2 })).toBe(false);
    expect(
      hasMerchantScanBenchOperationalBypass({
        scan_max_passes_per_member_per_day: 0,
        scan_max_points_per_transaction: 2,
      }),
    ).toBe(false);
    expect(hasMerchantScanBenchOperationalBypass(null)).toBe(false);
  });
});
