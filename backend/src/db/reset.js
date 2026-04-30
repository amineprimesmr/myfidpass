/**
 * Reset complet des données (dev / tests). Référence : REFONTE-REGLES.md.
 */
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { getDb } from "./connection.js";
import { getBusinessesByUserId } from "./businesses.js";
import { assetsDir } from "../pass/constants.js";

/** Logos / passes sur disque pour un commerce précis (hors lignes SQLite). */
function wipeBusinessDiskAssets(businessId) {
  if (!businessId) return;
  const dir = join(assetsDir, "businesses", String(businessId));
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error(`[deleteUserAccount] wipe assets/${businessId}:`, e?.message || e);
  }
}

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
  for (const bid of businessIds) {
    wipeBusinessDiskAssets(bid);
  }

  const tableExists = (name) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(String(name));
  const safeDeleteByUser = (table, column = "user_id") => {
    if (!tableExists(table)) return;
    db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(userId);
  };
  const safeDeleteByBusinessIds = (table, column = "business_id") => {
    if (!businessIds.length || !tableExists(table)) return;
    const placeholders = businessIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...businessIds);
  };

  const tx = db.transaction(() => {
    const placeholders = businessIds.map(() => "?").join(",");
    if (placeholders) {
      safeDeleteByBusinessIds("campaign_event_jobs");
      safeDeleteByBusinessIds("business_assets");
      safeDeleteByBusinessIds("notification_batches");
      safeDeleteByBusinessIds("notification_log");
      safeDeleteByBusinessIds("web_push_subscriptions");
      safeDeleteByBusinessIds("transactions");
      safeDeleteByBusinessIds("business_team_members");
      safeDeleteByBusinessIds("social_metric_snapshots");
      safeDeleteByBusinessIds("social_oauth_connections");
      safeDeleteByBusinessIds("google_business_reviews");
      safeDeleteByBusinessIds("google_business_posts");
      safeDeleteByBusinessIds("google_business_questions");
      safeDeleteByBusinessIds("google_business_insights_cache");
      safeDeleteByBusinessIds("google_business_location_cache");
      safeDeleteByBusinessIds("google_business_media");
      safeDeleteByBusinessIds("receipt_delivery_claims");

      const memberIds = db
        .prepare(`SELECT id FROM members WHERE business_id IN (${placeholders})`)
        .all(...businessIds)
        .map((r) => r.id);
      if (memberIds.length > 0) {
        const mPlaceholders = memberIds.map(() => "?").join(",");
        if (tableExists("reward_grants")) db.prepare(`DELETE FROM reward_grants WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
        if (tableExists("game_spins")) db.prepare(`DELETE FROM game_spins WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
        if (tableExists("ticket_ledger")) db.prepare(`DELETE FROM ticket_ledger WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
        if (tableExists("member_ticket_wallets")) db.prepare(`DELETE FROM member_ticket_wallets WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
        if (tableExists("member_category_assignments")) db.prepare(`DELETE FROM member_category_assignments WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
        if (tableExists("pass_registrations")) db.prepare(`DELETE FROM pass_registrations WHERE serial_number IN (${mPlaceholders})`).run(...memberIds);
      }
      safeDeleteByBusinessIds("reward_grants");
      safeDeleteByBusinessIds("game_spins");
      safeDeleteByBusinessIds("game_rewards");
      safeDeleteByBusinessIds("ticket_ledger");
      safeDeleteByBusinessIds("member_ticket_wallets");
      safeDeleteByBusinessIds("business_games");
      safeDeleteByBusinessIds("engagement_proofs");
      safeDeleteByBusinessIds("engagement_completions");

      const categoryIds = db
        .prepare(`SELECT id FROM member_categories WHERE business_id IN (${placeholders})`)
        .all(...businessIds)
        .map((r) => r.id);
      if (categoryIds.length > 0 && tableExists("member_category_assignments")) {
        const cPlaceholders = categoryIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM member_category_assignments WHERE category_id IN (${cPlaceholders})`).run(...categoryIds);
      }
      safeDeleteByBusinessIds("member_categories");
      safeDeleteByBusinessIds("members");
      if (tableExists("businesses")) {
        db.prepare(`DELETE FROM businesses WHERE id IN (${placeholders})`).run(...businessIds);
      }
    }

    safeDeleteByUser("merchant_push_devices");
    safeDeleteByUser("merchant_device_tokens");
    safeDeleteByUser("password_reset_tokens");
    safeDeleteByUser("subscriptions");
    safeDeleteByUser("refresh_tokens");
    safeDeleteByUser("merchant_entitlements");
    safeDeleteByUser("business_team_members");

    if (!tableExists("users")) return false;
    const info = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return info.changes > 0;
  });

  return tx();
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
