import { describe, expect, it } from "vitest";
import { DELIVERY_RECEIPT_SCAN_OVERLAY_ID } from "./delivery-receipt-scan-overlay.js";

describe("delivery-receipt-scan-overlay", () => {
  it("expose un id de racine stable pour l’overlay", () => {
    expect(DELIVERY_RECEIPT_SCAN_OVERLAY_ID).toBe("fidelity-dr-scan-root");
  });
});
