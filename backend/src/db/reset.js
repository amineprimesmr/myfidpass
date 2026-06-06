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

const tableExists = (name) =>
  !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(String(name));

const safeDeleteByBusinessId = (table, businessId, column = "business_id") => {
  if (!businessId || !tableExists(table)) return;
  db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(businessId);
};

/** Supprime toutes les lignes SQLite (+ dépendances membres) pour un commerce, sans effacer la fiche `businesses`. */
function purgeBusinessDataInTx(businessId) {
  if (!businessId) return;
  safeDeleteByBusinessId("campaign_event_jobs", businessId);
  safeDeleteByBusinessId("business_assets", businessId);
  safeDeleteByBusinessId("notification_batches", businessId);
  safeDeleteByBusinessId("notification_log", businessId);
  safeDeleteByBusinessId("web_push_subscriptions", businessId);
  safeDeleteByBusinessId("transactions", businessId);
  safeDeleteByBusinessId("business_team_members", businessId);
  safeDeleteByBusinessId("social_metric_snapshots", businessId);
  safeDeleteByBusinessId("social_oauth_connections", businessId);
  safeDeleteByBusinessId("google_business_reviews", businessId);
  safeDeleteByBusinessId("google_business_posts", businessId);
  safeDeleteByBusinessId("google_business_questions", businessId);
  safeDeleteByBusinessId("google_business_insights_cache", businessId);
  safeDeleteByBusinessId("google_business_location_cache", businessId);
  safeDeleteByBusinessId("google_business_media", businessId);
  safeDeleteByBusinessId("receipt_delivery_claims", businessId);

  const memberIds = db
    .prepare("SELECT id FROM members WHERE business_id = ?")
    .all(businessId)
    .map((r) => r.id);
  if (memberIds.length > 0) {
    const mPlaceholders = memberIds.map(() => "?").join(",");
    if (tableExists("reward_grants")) {
      db.prepare(`DELETE FROM reward_grants WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
    }
    if (tableExists("game_spins")) {
      db.prepare(`DELETE FROM game_spins WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
    }
    if (tableExists("ticket_ledger")) {
      db.prepare(`DELETE FROM ticket_ledger WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
    }
    if (tableExists("member_ticket_wallets")) {
      db.prepare(`DELETE FROM member_ticket_wallets WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
    }
    if (tableExists("member_category_assignments")) {
      db.prepare(`DELETE FROM member_category_assignments WHERE member_id IN (${mPlaceholders})`).run(...memberIds);
    }
    if (tableExists("pass_registrations")) {
      db.prepare(`DELETE FROM pass_registrations WHERE serial_number IN (${mPlaceholders})`).run(...memberIds);
    }
  }
  safeDeleteByBusinessId("reward_grants", businessId);
  safeDeleteByBusinessId("game_spins", businessId);
  safeDeleteByBusinessId("game_rewards", businessId);
  safeDeleteByBusinessId("ticket_ledger", businessId);
  safeDeleteByBusinessId("member_ticket_wallets", businessId);
  safeDeleteByBusinessId("business_games", businessId);
  safeDeleteByBusinessId("engagement_proofs", businessId);
  safeDeleteByBusinessId("engagement_completions", businessId);

  const categoryIds = db
    .prepare("SELECT id FROM member_categories WHERE business_id = ?")
    .all(businessId)
    .map((r) => r.id);
  if (categoryIds.length > 0 && tableExists("member_category_assignments")) {
    const cPlaceholders = categoryIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM member_category_assignments WHERE category_id IN (${cPlaceholders})`).run(...categoryIds);
  }
  safeDeleteByBusinessId("member_categories", businessId);
  safeDeleteByBusinessId("members", businessId);
  if (tableExists("merchant_business_subscriptions")) {
    db.prepare("DELETE FROM merchant_business_subscriptions WHERE business_id = ?").run(businessId);
  }
}

/**
 * Supprime définitivement un commerce (données, membres, assets disque). Le compte propriétaire est conservé.
 */
export function deleteBusinessCompletely(businessId) {
  if (!businessId) return false;
  wipeBusinessDiskAssets(businessId);
  const tx = db.transaction(() => {
    purgeBusinessDataInTx(businessId);
    if (!tableExists("businesses")) return false;
    const info = db.prepare("DELETE FROM businesses WHERE id = ?").run(businessId);
    return info.changes > 0;
  });
  return tx();
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

  const safeDeleteByUser = (table, column = "user_id") => {
    if (!tableExists(table)) return;
    db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(userId);
  };

  const tx = db.transaction(() => {
    for (const bid of businessIds) {
      purgeBusinessDataInTx(bid);
      if (tableExists("businesses")) {
        db.prepare("DELETE FROM businesses WHERE id = ?").run(bid);
      }
    }

    safeDeleteByUser("merchant_push_devices");
    safeDeleteByUser("merchant_device_tokens");
    safeDeleteByUser("password_reset_tokens");
    safeDeleteByUser("subscriptions");
    safeDeleteByUser("merchant_business_subscriptions");
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
  try {
    db.exec("DELETE FROM merchant_business_subscriptions");
  } catch (_) {}
  try {
    db.exec("DELETE FROM merchant_entitlements");
  } catch (_) {}
  db.exec("DELETE FROM subscriptions");
  db.exec("DELETE FROM users");

  wipeBusinessAssetDirectories();
}
