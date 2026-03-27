/**
 * Repository pass_registrations et merchant_device_tokens (Apple Wallet, APNs). Référence : REFONTE-REGLES.md.
 */
import { getDb } from "./connection.js";
import { formatUtcSqlWithMs } from "./datetime-sql.js";

const db = getDb();
const TEST_DEVICE_ID = "test-device-123";

export function registerPassDevice({ deviceLibraryIdentifier, passTypeIdentifier, serialNumber, pushToken }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO pass_registrations (device_library_identifier, pass_type_identifier, serial_number, push_token, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(deviceLibraryIdentifier, passTypeIdentifier, serialNumber, pushToken || null, now);
}

export function upsertMerchantDeviceToken(userId, deviceToken) {
  if (!userId || !deviceToken || typeof deviceToken !== "string" || !deviceToken.trim()) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO merchant_device_tokens (user_id, device_token, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET device_token = excluded.device_token, updated_at = excluded.updated_at`
  ).run(userId, deviceToken.trim(), now);
}

/** Token APNs hex pour l’app commerçant (mode « test sur mon iPhone »). */
export function getMerchantDeviceToken(userId) {
  if (!userId) return null;
  const row = db.prepare("SELECT device_token FROM merchant_device_tokens WHERE user_id = ?").get(userId);
  const t = row?.device_token;
  if (!t || typeof t !== "string") return null;
  const s = t.trim();
  return s.length > 0 ? s : null;
}

export function getPushTokensForMember(serialNumber) {
  const rows = db.prepare(
    `SELECT push_token FROM pass_registrations
     WHERE serial_number = ? AND push_token IS NOT NULL AND push_token != '' AND device_library_identifier != ?`
  ).all(serialNumber, TEST_DEVICE_ID);
  return rows.map((r) => r.push_token).filter(Boolean);
}

export function getPassKitPushTokensForBusiness(businessId) {
  const rows = db.prepare(
    `SELECT pr.push_token, pr.serial_number
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE m.business_id = ? AND pr.push_token IS NOT NULL AND pr.push_token != ''
       AND pr.device_library_identifier != ?`
  ).all(businessId, TEST_DEVICE_ID);
  return rows;
}

export function getPassKitRegistrationsCountForBusiness(businessId) {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE m.business_id = ? AND pr.device_library_identifier != ?`
  ).get(businessId, TEST_DEVICE_ID);
  return row?.n ?? 0;
}

export function getPassRegistrationsTotalCount() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM pass_registrations").get();
  return row?.n ?? 0;
}

export function unregisterPassDevice(deviceLibraryIdentifier, passTypeIdentifier, serialNumber) {
  db.prepare(
    "DELETE FROM pass_registrations WHERE device_library_identifier = ? AND pass_type_identifier = ? AND serial_number = ?"
  ).run(deviceLibraryIdentifier, passTypeIdentifier, serialNumber);
}

function parsePassUpdatedAt(str) {
  if (!str || typeof str !== "string") return 0;
  const s = str.trim();
  const iso = s.replace(" ", "T").replace(/Z?$/, "Z");
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Instant « pass mis à jour » côté PassKit : visite en caisse, dernière diffusion, création du membre,
 * ou mise à jour des textes pass (sans confondre avec une nouvelle diffusion — voir notification_pass_layout_at).
 */
export function effectivePassKitRowUpdateTs(row) {
  return Math.max(
    parsePassUpdatedAt(row.last_visit_at),
    parsePassUpdatedAt(row.last_broadcast_at),
    parsePassUpdatedAt(row.created_at),
    parsePassUpdatedAt(row.notification_pass_layout_at)
  );
}

export function getUpdatedPassSerialNumbersForDevice(deviceId, passTypeId, passesUpdatedSince = null) {
  const base = db.prepare(
    `SELECT pr.serial_number, m.last_visit_at, m.created_at, b.last_broadcast_at, b.notification_pass_layout_at
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     INNER JOIN businesses b ON b.id = m.business_id
     WHERE pr.device_library_identifier = ? AND pr.pass_type_identifier = ?`
  ).all(deviceId, passTypeId);
  let list = base;
  if (passesUpdatedSince && String(passesUpdatedSince).trim()) {
    const sinceTs = parsePassUpdatedAt(String(passesUpdatedSince));
    list = base.filter((r) => effectivePassKitRowUpdateTs(r) > sinceTs);
  }
  const serialNumbers = list.map((r) => r.serial_number);
  let lastUpdated = formatUtcSqlWithMs(new Date());
  if (list.length > 0) {
    const maxTs = list.reduce((acc, r) => Math.max(acc, effectivePassKitRowUpdateTs(r)), 0);
    if (maxTs > 0) {
      lastUpdated = formatUtcSqlWithMs(maxTs);
    }
  }
  return { serialNumbers, lastUpdated };
}

export function removeTestPassKitDevices(businessId) {
  const r = db.prepare(
    "DELETE FROM pass_registrations WHERE device_library_identifier = 'test-device-123' AND serial_number IN (SELECT id FROM members WHERE business_id = ?)"
  ).run(businessId);
  return r.changes;
}

export function getPassKitPushTokensForBusinessFiltered(businessId, memberIds = null) {
  const base = db.prepare(
    `SELECT pr.push_token, pr.serial_number
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE m.business_id = ? AND pr.push_token IS NOT NULL AND pr.push_token != ''
       AND pr.device_library_identifier != ?`
  );
  let rows = base.all(businessId, TEST_DEVICE_ID);
  if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const set = new Set(memberIds);
    rows = rows.filter((r) => set.has(r.serial_number));
  }
  return rows;
}
