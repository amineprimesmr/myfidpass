#!/usr/bin/env node
/**
 * Vérifie en local (SQLite test-data) le pipeline 2 campagnes :
 * - last_broadcast + bump
 * - filtre GET registrations (pas de 204 sur la 2e)
 * - valeurs pass lastMessage distinctes
 *
 * Usage: cd backend && DATA_DIR=./test-data-verify node scripts/verify-consecutive-broadcast.js
 */
import { randomUUID } from "crypto";
import { rmSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const testDir = process.env.DATA_DIR || join(__dir, "../test-data-verify");

process.env.DATA_DIR = testDir;
process.env.NODE_ENV = "test";

rmSync(testDir, { recursive: true, force: true });
mkdirSync(testDir, { recursive: true });

const { initDb } = await import("../src/db/migrations.js");
initDb();

const {
  createBusiness,
  createMember,
  getBusinessById,
  bumpBusinessPassRefreshTimestamp,
  updateBusiness,
} = await import("../src/db/businesses.js");
const { setLastBroadcastMessage } = await import("../src/db/categories.js");
const { registerPassDevice, getUpdatedPassSerialNumbersForDevice } = await import("../src/db/passes.js");
const { setBusinessAssetData } = await import("../src/db/business-assets.js");
const { formatUtcSqlWithMs } = await import("../src/db/datetime-sql.js");
const { buildLastBroadcastFieldValue } = await import("../src/pass/broadcast-field.js");

const DEVICE = "verify-device-wallet";
const PASS_TYPE = process.env.PASS_TYPE_ID || "pass.com.fidelity";

const biz = createBusiness({
  name: "Verify broadcast",
  slug: `verify-bcast-${Date.now()}`,
  organizationName: "Verify",
});
const memberId = randomUUID();
createMember({ id: memberId, businessId: biz.id, email: "v@test.fr", name: "Test" });
setBusinessAssetData(biz.id, "notification_icon", "data:image/png;base64,iVBORw0KGgo=");
updateBusiness(biz.id, { asset_notification_icon_present: 1 });

registerPassDevice({
  deviceLibraryIdentifier: DEVICE,
  passTypeIdentifier: PASS_TYPE,
  serialNumber: memberId,
  pushToken: "0".repeat(64),
});

function simulateDispatch(message, title) {
  setLastBroadcastMessage(biz.id, message);
  if (title) {
    updateBusiness(biz.id, { notification_title_override: title });
  }
  bumpBusinessPassRefreshTimestamp(biz.id);
}

console.log("── Campagne 1 ──");
simulateDispatch("Message campagne un", "Titre commerce");
const after1 = getBusinessById(biz.id);
const reg1 = getUpdatedPassSerialNumbersForDevice(DEVICE, PASS_TYPE, null);
const tag1 = reg1.lastUpdated;
const reg1Since = getUpdatedPassSerialNumbersForDevice(DEVICE, PASS_TYPE, tag1);
console.log("  serials (sans since):", reg1.serialNumbers.length);
console.log("  lastUpdated:", tag1);

console.log("── PATCH titre identique (comme app iOS) ──");
const bMid = getBusinessById(biz.id);
updateBusiness(biz.id, { notification_title_override: bMid.notification_title_override });

console.log("── Campagne 2 (immédiat) ──");
simulateDispatch("Message campagne deux", "Titre commerce");
const after2 = getBusinessById(biz.id);
const reg2 = getUpdatedPassSerialNumbersForDevice(DEVICE, PASS_TYPE, tag1);
const v1 = buildLastBroadcastFieldValue("Message campagne un", after1.last_broadcast_at, 1);
const v2 = buildLastBroadcastFieldValue(
  after2.last_broadcast_message,
  after2.last_broadcast_at,
  after2.broadcast_send_seq
);

let ok = true;
if (reg2.serialNumbers.length === 0) {
  console.error("FAIL: 204 / liste vide après campagne 2 (passesUpdatedSince=", tag1, ")");
  ok = false;
} else {
  console.log("  serials après since campagne 1:", reg2.serialNumbers.length, "OK");
}
if (v1 === v2) {
  console.error("FAIL: lastMessage identique entre campagne 1 et 2");
  ok = false;
} else {
  console.log("  lastMessage distinct:", JSON.stringify(v2.slice(0, 40)), "OK");
}
if (Number(after2.broadcast_send_seq) < 2) {
  console.error("FAIL: broadcast_send_seq < 2");
  ok = false;
}

console.log(ok ? "\n✅ verify-consecutive-broadcast OK" : "\n❌ verify-consecutive-broadcast FAILED");
process.exit(ok ? 0 : 1);
