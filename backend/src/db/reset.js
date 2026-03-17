/**
 * Reset complet des données (dev / tests). Référence : REFONTE-REGLES.md.
 */
import { getDb } from "./connection.js";

const db = getDb();

export function resetAllData() {
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
  db.exec("DELETE FROM merchant_device_tokens");
  db.exec("DELETE FROM member_category_assignments");
  db.exec("DELETE FROM member_categories");
  db.exec("DELETE FROM members");
  db.exec("DELETE FROM businesses");
  db.exec("DELETE FROM password_reset_tokens");
  db.exec("DELETE FROM subscriptions");
  db.exec("DELETE FROM users");
}
