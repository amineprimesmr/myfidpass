/**
 * Repository pass_registrations et merchant_push_devices (Apple Wallet, APNs). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();
const TEST_DEVICE_ID = "test-device-123";

/**
 * PassKit `serial_number` = `members.id` ou `loyalty_group_member_id` (réseau multi-adresses).
 * Sans ce JOIN, les campagnes manuelles ne trouvent aucun token Wallet après liaison réseau.
 */
export const PASS_SERIAL_MEMBER_JOIN_SQL = `(
  m.id = pr.serial_number
  OR (
    m.loyalty_group_member_id IS NOT NULL
    AND TRIM(m.loyalty_group_member_id) != ''
    AND m.loyalty_group_member_id = pr.serial_number
  )
)`;

/** Résout l’id membre local à journaliser depuis un serial PassKit. */
export function resolveMemberIdForPassSerial(serialNumber, businessId) {
  const serial = String(serialNumber ?? "").trim();
  if (!serial || !businessId) return serial || null;
  const direct = db
    .prepare("SELECT id FROM members WHERE business_id = ? AND id = ? LIMIT 1")
    .get(businessId, serial);
  if (direct?.id) return direct.id;
  const viaGroup = db
    .prepare(
      `SELECT id FROM members WHERE business_id = ? AND loyalty_group_member_id = ? LIMIT 1`,
    )
    .get(businessId, serial);
  return viaGroup?.id ?? serial;
}

/** Filtre segment : serial PassKit peut être id local ou id groupe. */
function passRowMatchesMemberFilter(row, memberIdSet, businessId) {
  const serial = String(row?.serial_number ?? "").trim();
  if (!serial) return false;
  if (memberIdSet.has(serial)) return true;
  const localId = resolveMemberIdForPassSerial(serial, businessId);
  return localId ? memberIdSet.has(localId) : false;
}

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

/** Serial(s) PassKit possibles pour un membre (id local ou id réseau fidélité). */
function passSerialNumbersForMemberLookup(serialNumber) {
  const serial = String(serialNumber ?? "").trim();
  if (!serial) return [];
  const serials = new Set([serial]);
  const row = db
    .prepare(
      `SELECT id, loyalty_group_member_id FROM members
       WHERE id = ? OR loyalty_group_member_id = ? LIMIT 1`,
    )
    .get(serial, serial);
  if (row?.id) serials.add(String(row.id).trim());
  const groupId =
    row?.loyalty_group_member_id != null ? String(row.loyalty_group_member_id).trim() : "";
  if (groupId) serials.add(groupId);
  return [...serials].filter(Boolean);
}

export function getPushTokensForMember(serialNumber) {
  const serials = passSerialNumbersForMemberLookup(serialNumber);
  if (serials.length === 0) return [];
  const placeholders = serials.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT push_token FROM pass_registrations
     WHERE serial_number IN (${placeholders}) AND push_token IS NOT NULL AND push_token != ''
       AND device_library_identifier != ?`,
  ).all(...serials, TEST_DEVICE_ID);
  const seen = new Set();
  return rows
    .map((r) => r.push_token)
    .filter((t) => {
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
}

/** Au moins un enregistrement PassKit réel (hors device de test) → iPhone a contacté le web service à l’ajout du pass. */
export function memberHasAppleWalletRegistration(serialNumber) {
  const serials = passSerialNumbersForMemberLookup(serialNumber);
  if (serials.length === 0) return false;
  const placeholders = serials.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM pass_registrations
       WHERE serial_number IN (${placeholders}) AND device_library_identifier != ?
       LIMIT 1`,
    )
    .get(...serials, TEST_DEVICE_ID);
  return row != null && Number(row.ok) === 1;
}

export function getPassKitPushTokensForBusiness(businessId) {
  const rows = db.prepare(
    `SELECT pr.push_token, pr.serial_number
     FROM pass_registrations pr
     INNER JOIN members m ON ${PASS_SERIAL_MEMBER_JOIN_SQL}
     WHERE m.business_id = ? AND pr.push_token IS NOT NULL AND pr.push_token != ''
       AND pr.device_library_identifier != ?`
  ).all(businessId, TEST_DEVICE_ID);
  return rows;
}

export function getPassKitRegistrationsCountForBusiness(businessId) {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM pass_registrations pr
     INNER JOIN members m ON ${PASS_SERIAL_MEMBER_JOIN_SQL}
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

export function parsePassKitUpdateTag(value) {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s) return 0;

  const msMatch = s.match(/^(?:ms:)?(\d{10,})$/);
  if (msMatch) {
    const n = Number(msMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  const iso = s.replace(" ", "T").replace(/Z?$/, "Z");
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Instant « pass mis à jour » côté PassKit : visite en caisse, dernière diffusion, création du membre,
 * ou mise à jour des textes pass (sans confondre avec une nouvelle diffusion — voir notification_pass_layout_at).
 */
export function effectivePassKitRowUpdateTs(row) {
  const passMs = Number(row.pass_last_modified_ms);
  const passMsOk = Number.isFinite(passMs) && passMs > 0 ? passMs : 0;
  return Math.max(
    parsePassKitUpdateTag(row.last_visit_at),
    parsePassKitUpdateTag(row.last_broadcast_at),
    parsePassKitUpdateTag(row.created_at),
    parsePassKitUpdateTag(row.notification_pass_layout_at),
    passMsOk
  );
}

function formatPassKitUpdateTag(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? `ms:${Math.floor(n)}` : `ms:${Date.now()}`;
}

export function getUpdatedPassSerialNumbersForDevice(deviceId, passTypeId, passesUpdatedSince = null) {
  const base = db.prepare(
    `SELECT pr.serial_number, m.last_visit_at, m.created_at, b.last_broadcast_at, b.notification_pass_layout_at, b.pass_last_modified_ms
     FROM pass_registrations pr
     INNER JOIN members m ON ${PASS_SERIAL_MEMBER_JOIN_SQL}
     INNER JOIN businesses b ON b.id = m.business_id
     WHERE pr.device_library_identifier = ? AND pr.pass_type_identifier = ?`
  ).all(deviceId, passTypeId);
  let list = base;
  if (passesUpdatedSince && String(passesUpdatedSince).trim()) {
    const sinceTs = parsePassKitUpdateTag(String(passesUpdatedSince));
    list = base.filter((r) => effectivePassKitRowUpdateTs(r) > sinceTs);
  }
  const serialNumbers = list.map((r) => r.serial_number);
  let lastUpdated = formatPassKitUpdateTag(Date.now());
  if (list.length > 0) {
    const maxTs = list.reduce((acc, r) => Math.max(acc, effectivePassKitRowUpdateTs(r)), 0);
    if (maxTs > 0) {
      lastUpdated = formatPassKitUpdateTag(maxTs);
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
     INNER JOIN members m ON ${PASS_SERIAL_MEMBER_JOIN_SQL}
     WHERE m.business_id = ? AND pr.push_token IS NOT NULL AND pr.push_token != ''
       AND pr.device_library_identifier != ?`
  );
  let rows = base.all(businessId, TEST_DEVICE_ID);
  if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const set = new Set(memberIds);
    rows = rows.filter((r) => passRowMatchesMemberFilter(r, set, businessId));
  }
  return rows;
}
