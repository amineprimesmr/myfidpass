/**
 * Reset complet des données (dev / tests). Référence : REFONTE-REGLES.md.
 */
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { getDb } from "./connection.js";
import { getBusinessesByUserId } from "./businesses.js";
import { assetsDir } from "../pass/constants.js";

const db = getDb();

/**
 * Logos / passes sur disque (backend/assets/businesses/<id>/) — hors SQLite, donc absent du simple DELETE.
 */
function wipeBusinessAssetDirectories() {
  const root = join(assetsDir, "businesses");
  if (!existsSync(root)) return;
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".")) continue;
    try {
      rmSync(join(root, ent.name), { recursive: true, force: true });
    } catch (e) {
      console.error(`[reset] Échec suppression assets/businesses/${ent.name}:`, e?.message || e);
    }
  }
}

/**
 * Supprime définitivement le compte d'un utilisateur et toutes ses données (RGPD, exigence App Store).
 * Ordre de suppression respectant les clés étrangères.
 */
export function deleteUserAccount(userId) {
  if (!userId) return false;
  const businesses = getBusinessesByUserId(userId);
  const businessIds = businesses.map((b) => b.id);
  const placeholders = businessIds.map(() => "?").join(",");
  if (placeholders) {
    try {
      db.prepare(`DELETE FROM notification_batches WHERE business_id IN (${placeholders})`).run(...businessIds);
    } catch (_) {}
    db.prepare(`DELETE FROM notification_log WHERE business_id IN (${placeholders})`).run(...businessIds);
    db.prepare(`DELETE FROM web_push_subscriptions WHERE business_id IN (${placeholders})`).run(...businessIds);
    db.prepare(`DELETE FROM transactions WHERE business_id IN (${placeholders})`).run(...businessIds);
    const memberIds = db.prepare(`SELECT id FROM members WHERE business_id IN (${placeholders})`).all(...businessIds).map((r) => r.id);
    if (memberIds.length > 0) {
      const mPlaceholders = memberIds.map(() => "?").join(",");
      try { db.prepare(`DELETE FROM reward_grants WHERE member_id IN (${mPlaceholders})`).run(...memberIds); } catch (_) {}
      try { db.prepare(`DELETE FROM game_spins WHERE member_id IN (${mPlaceholders})`).run(...memberIds); } catch (_) {}
      try { db.prepare(`DELETE FROM ticket_ledger WHERE member_id IN (${mPlaceholders})`).run(...memberIds); } catch (_) {}
      try { db.prepare(`DELETE FROM member_ticket_wallets WHERE member_id IN (${mPlaceholders})`).run(...memberIds); } catch (_) {}
      try { db.prepare(`DELETE FROM member_category_assignments WHERE member_id IN (${mPlaceholders})`).run(...memberIds); } catch (_) {}
      db.prepare(`DELETE FROM pass_registrations WHERE serial_number IN (${mPlaceholders})`).run(...memberIds);
    }
    try { db.prepare(`DELETE FROM reward_grants WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM game_spins WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM game_rewards WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM ticket_ledger WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM member_ticket_wallets WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM business_games WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM engagement_proofs WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    try { db.prepare(`DELETE FROM engagement_completions WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    const categoryIds = db.prepare(`SELECT id FROM member_categories WHERE business_id IN (${placeholders})`).all(...businessIds).map((r) => r.id);
    if (categoryIds.length > 0) {
      const cPlaceholders = categoryIds.map(() => "?").join(",");
      try { db.prepare(`DELETE FROM member_category_assignments WHERE category_id IN (${cPlaceholders})`).run(...categoryIds); } catch (_) {}
    }
    try { db.prepare(`DELETE FROM member_categories WHERE business_id IN (${placeholders})`).run(...businessIds); } catch (_) {}
    db.prepare(`DELETE FROM members WHERE business_id IN (${placeholders})`).run(...businessIds);
    db.prepare(`DELETE FROM businesses WHERE id IN (${placeholders})`).run(...businessIds);
  }
  try {
    db.prepare("DELETE FROM merchant_push_devices WHERE user_id = ?").run(userId);
  } catch (_) {}
  db.prepare("DELETE FROM merchant_device_tokens WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(userId);
  try { db.prepare("DELETE FROM refresh_tokens WHERE user_id = ?").run(userId); } catch (_) {}
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return true;
}

export function resetAllData() {
  try {
    db.exec("DELETE FROM notification_batches");
  } catch (_) {}
  try {
    db.exec("DELETE FROM campaign_event_jobs");
  } catch (_) {}
  db.exec("DELETE FROM notification_log");
  db.exec("DELETE FROM reward_grants");
  db.exec("DELETE FROM game_spins");
  db.exec("DELETE FROM game_rewards");
  db.exec("DELETE FROM ticket_ledger");
  db.exec("DELETE FROM member_ticket_wallets");
  db.exec("DELETE FROM business_games");
  db.exec("DELETE FROM engagement_proofs");
  db.exec("DELETE FROM engagement_completions");
  db.exec("DELETE FROM transactions");
  db.exec("DELETE FROM web_push_subscriptions");
  db.exec("DELETE FROM pass_registrations");
  try {
    db.exec("DELETE FROM merchant_push_devices");
  } catch (_) {}
  db.exec("DELETE FROM merchant_device_tokens");
  db.exec("DELETE FROM member_category_assignments");
  db.exec("DELETE FROM member_categories");
  db.exec("DELETE FROM members");
  try {
    db.exec("DELETE FROM business_assets");
  } catch (_) {}
  db.exec("DELETE FROM businesses");
  db.exec("DELETE FROM password_reset_tokens");
  try {
    db.exec("DELETE FROM refresh_tokens");
  } catch (_) {}
  db.exec("DELETE FROM subscriptions");
  db.exec("DELETE FROM users");

  wipeBusinessAssetDirectories();
}
