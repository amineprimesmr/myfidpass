/**
 * Utilitaires de mapping Parametres SaaS (parite iOS).
 */

/** @param {number} value @param {number} min @param {number} max */
function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * @param {string} message
 */
export function normalizeSettingsMessage(message) {
  return String(message || "").trim();
}

/**
 * @param {Record<string, unknown>} raw
 */
export function mapDashboardSettingsToForm(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    organizationName: String(src.organization_name ?? src.organizationName ?? "").trim(),
    locationAddress: String(src.location_address ?? src.locationAddress ?? "").trim(),
    contactEmail: String(src.back_contact ?? src.backContact ?? "").trim(),
    contactPhone: String(src.back_terms ?? src.backTerms ?? "").trim(),
    scanMaxPassesPerMemberPerDay: src.scan_max_passes_per_member_per_day ?? src.scanMaxPassesPerMemberPerDay ?? 0,
    scanMaxPointsPerTransaction: src.scan_max_points_per_transaction ?? src.scanMaxPointsPerTransaction ?? 0,
    requireReceiptQrValidation: Number(src.require_receipt_qr_validation ?? src.requireReceiptQrValidation ?? 0) === 1,
    receiptQrToleranceCents: src.receipt_qr_tolerance_cents ?? src.receiptQrToleranceCents ?? 5,
    notificationChangeMessage: String(src.notification_change_message ?? src.notificationChangeMessage ?? "").trim(),
  };
}

/**
 * @param {{
 * organizationName: string;
 * locationAddress: string;
 * contactEmail: string;
 * contactPhone: string;
 * scanMaxPassesPerMemberPerDay: unknown;
 * scanMaxPointsPerTransaction: unknown;
 * requireReceiptQrValidation: boolean;
 * receiptQrToleranceCents: unknown;
 * notificationChangeMessage?: string;
 * }} state
 */
export function buildSettingsPatchPayload(state) {
  const name = String(state.organizationName || "").trim();
  const address = String(state.locationAddress || "").trim();
  const email = String(state.contactEmail || "").trim();
  const phone = String(state.contactPhone || "").trim();
  const scanMaxPasses = clampInt(Number(state.scanMaxPassesPerMemberPerDay || 0), 0, 999);
  const scanMaxPoints = clampInt(Number(state.scanMaxPointsPerTransaction || 0), 0, 999999);
  const receiptTolerance = clampInt(Number(state.receiptQrToleranceCents || 5), 0, 500);
  const notificationMessage = normalizeSettingsMessage(state.notificationChangeMessage || "");

  return {
    organization_name: name || undefined,
    location_address: address || undefined,
    back_contact: email || null,
    back_terms: phone || null,
    scan_max_passes_per_member_per_day: scanMaxPasses,
    scan_max_points_per_transaction: scanMaxPoints,
    require_receipt_qr_validation: state.requireReceiptQrValidation ? 1 : 0,
    receipt_qr_tolerance_cents: receiptTolerance,
    notification_change_message: notificationMessage || null,
  };
}

/**
 * @param {string} value
 */
export function isValidEmail(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
