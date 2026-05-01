/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  buildSettingsPatchPayload,
  isValidEmail,
  mapDashboardSettingsToForm,
  normalizeSettingsMessage,
} from "./app-settings-helpers.js";

describe("app-settings-helpers", () => {
  it("mapDashboardSettingsToForm lit snake_case et camelCase", () => {
    const out = mapDashboardSettingsToForm({
      organization_name: "Cafe Demo",
      locationAddress: "1 rue de Paris",
      requireReceiptQrValidation: 1,
      receipt_qr_tolerance_cents: 12,
    });
    expect(out.organizationName).toBe("Cafe Demo");
    expect(out.locationAddress).toBe("1 rue de Paris");
    expect(out.requireReceiptQrValidation).toBe(true);
    expect(out.receiptQrToleranceCents).toBe(12);
  });

  it("buildSettingsPatchPayload borne les valeurs numeriques", () => {
    const payload = buildSettingsPatchPayload({
      organizationName: "X",
      locationAddress: "Y",
      contactEmail: "mail@test.fr",
      contactPhone: "010203",
      scanMaxPassesPerMemberPerDay: 9999,
      scanMaxPointsPerTransaction: -4,
      requireReceiptQrValidation: true,
      receiptQrToleranceCents: 9999,
      notificationChangeMessage: " hello ",
    });
    expect(payload.scan_max_passes_per_member_per_day).toBe(999);
    expect(payload.scan_max_points_per_transaction).toBe(0);
    expect(payload.receipt_qr_tolerance_cents).toBe(500);
    expect(payload.notification_change_message).toBe("hello");
  });

  it("normalise et valide les emails", () => {
    expect(normalizeSettingsMessage("  bonjour ")).toBe("bonjour");
    expect(isValidEmail("contact@shop.fr")).toBe(true);
    expect(isValidEmail("contact@shop")).toBe(false);
  });
});
