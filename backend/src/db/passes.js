/**
 * Repository pass_registrations et merchant_push_devices (Apple Wallet, APNs). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
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

function merchantDevicesTable() {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_push_devices'").get();
  return !!row;
}

/** Enregistre ou met à jour un appareil (token unique ; plusieurs appareils par utilisateur). */
export function upsertMerchantDeviceToken(userId, deviceToken) {
  if (!userId || !deviceToken || typeof deviceToken !== "string" || !deviceToken.trim()) return;
  const now = new Date().toISOString();
  const tok = deviceToken.trim();
  if (merchantDevicesTable()) {
    const row = db.prepare("SELECT id FROM merchant_push_devices WHERE device_token = ?").get(tok);
    if (row?.id) {
      db.prepare("UPDATE merchant_push_devices SET user_id = ?, updated_at = ? WHERE device_token = ?").run(userId, now, tok);
    } else {
      db.prepare(
        `INSERT INTO merchant_push_devices (id, user_id, device_token, updated_at) VALUES (?, ?, ?, ?)`
      ).run(randomUUID(), userId, tok, now);
    }
    return;
  }
  db.prepare(
    `INSERT INTO merchant_device_tokens (user_id, device_token, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET device_token = excluded.device_token, updated_at = excluded.updated_at`
  ).run(userId, tok, now);
}

/** Tous les tokens APNs actifs pour l’utilisateur (app commerçant). */
export function getMerchantDeviceTokensForUser(userId) {
  if (!userId) return [];
  if (merchantDevicesTable()) {
    const rows = db.prepare("SELECT device_token FROM merchant_push_devices WHERE user_id = ?").all(userId);
    return rows.map((r) => String(r.device_token).trim()).filter(Boolean);
  }
  const row = db.prepare("SELECT device_token FROM merchant_device_tokens WHERE user_id = ?").get(userId);
  const t = row?.device_token;
  if (!t || typeof t !== "string") return [];
  const s = t.trim();
  return s.length > 0 ? [s] : [];
}

/** @deprecated Utiliser getMerchantDeviceTokensForUser — premier token uniquement. */
export function getMerchantDeviceToken(userId) {
  const arr = getMerchantDeviceTokensForUser(userId);
  return arr[0] ?? null;
}

export function deleteMerchantPushDeviceByToken(deviceToken) {
  if (!deviceToken || typeof deviceToken !== "string") return 0;
  const tok = deviceToken.trim();
  if (!tok) return 0;
  if (merchantDevicesTable()) {
    const r = db.prepare("DELETE FROM merchant_push_devices WHERE device_token = ?").run(tok);
    return r.changes ?? 0;
  }
  const r = db.prepare("DELETE FROM merchant_device_tokens WHERE device_token = ?").run(tok);
  return r.changes ?? 0;
}

/** Supprime les enregistrements PassKit dont le push_token est invalide côté Apple. */
export function deletePassRegistrationsByPushToken(pushToken) {
  if (!pushToken || typeof pushToken !== "string") return 0;
  const tok = pushToken.trim();
  if (!tok) return 0;
  const r = db.prepare("DELETE FROM pass_registrations WHERE push_token = ?").run(tok);
  return r.changes ?? 0;
}

export function getPushTokensForMember(serialNumber) {
  const rows = db.prepare(
    `SELECT push_token FROM pass_registrations
     WHERE serial_number = ? AND push_token IS NOT NULL AND push_token != '' AND device_library_identifier != ?`
  ).all(serialNumber, TEST_DEVICE_ID);
  return rows.map((r) => r.push_token).filter(Boolean);
}

/** Au moins un enregistrement PassKit réel (hors device de test) → iPhone a contacté le web service à l’ajout du pass. */
export function memberHasAppleWalletRegistration(serialNumber) {
  if (!serialNumber || typeof serialNumber !== "string") return false;
  const id = serialNumber.trim();
  if (!id) return false;
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM pass_registrations
       WHERE serial_number = ? AND device_library_identifier != ?
       LIMIT 1`,
    )
    .get(id, TEST_DEVICE_ID);
  return row != null && Number(row.ok) === 1;
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
 * Tag `passesUpdatedSince` renvoyé par Wallet (parfois sans millisecondes).
 * Recule d’1 s pour ne pas rater une MAJ dans la même seconde UTC.
 */
function passesUpdatedSinceCutoffMs(tag) {
  const ts = parsePassUpdatedAt(tag);
  if (!ts) return 0;
  const raw = String(tag).trim();
  const hasSubSecond = /\.\d{1,3}/.test(raw);
  return hasSubSecond ? ts : ts - 1000;
}

/**
 * Instant « pass mis à jour » côté PassKit : visite en caisse, dernière diffusion, création du membre,
 * ou mise à jour des textes pass (sans confondre avec une nouvelle diffusion — voir notification_pass_layout_at).
 */
export function effectivePassKitRowUpdateTs(row) {
  const passMs = Number(row.pass_last_modified_ms);
  const passMsOk = Number.isFinite(passMs) && passMs > 0 ? passMs : 0;
  return Math.max(
    parsePassUpdatedAt(row.last_visit_at),
    parsePassUpdatedAt(row.last_broadcast_at),
    parsePassUpdatedAt(row.created_at),
    parsePassUpdatedAt(row.notification_pass_layout_at),
    passMsOk
  );
}

export function getUpdatedPassSerialNumbersForDevice(deviceId, passTypeId, passesUpdatedSince = null) {
  const base = db.prepare(
    `SELECT pr.serial_number, m.last_visit_at, m.created_at, b.last_broadcast_at, b.notification_pass_layout_at, b.pass_last_modified_ms
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     INNER JOIN businesses b ON b.id = m.business_id
     WHERE pr.device_library_identifier = ? AND pr.pass_type_identifier = ?`
  ).all(deviceId, passTypeId);
  let list = base;
  if (passesUpdatedSince && String(passesUpdatedSince).trim()) {
    const sinceMs = passesUpdatedSinceCutoffMs(String(passesUpdatedSince));
    list = base.filter((r) => {
      const passMs = Number(r.pass_last_modified_ms);
      if (Number.isFinite(passMs) && passMs > sinceMs) return true;
      return effectivePassKitRowUpdateTs(r) > sinceMs;
    });
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
