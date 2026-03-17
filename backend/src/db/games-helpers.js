/**
 * Helpers internes pour games (wallets, rewards, tirage). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

export function parseJsonSafe(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch (_e) {
    return fallback;
  }
}

export function getDefaultPointsPerTicket(business) {
  const n = Number(business?.points_per_ticket);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

export function ensureMemberTicketWallet(businessId, memberId) {
  const existing = db
    .prepare("SELECT member_id, business_id, ticket_balance, updated_at FROM member_ticket_wallets WHERE member_id = ? AND business_id = ?")
    .get(memberId, businessId);
  if (existing) return existing;
  db.prepare(
    "INSERT OR IGNORE INTO member_ticket_wallets (member_id, business_id, ticket_balance, updated_at) VALUES (?, ?, 0, datetime('now'))"
  ).run(memberId, businessId);
  return db
    .prepare("SELECT member_id, business_id, ticket_balance, updated_at FROM member_ticket_wallets WHERE member_id = ? AND business_id = ?")
    .get(memberId, businessId);
}

/** Exporté pour engagement.js (récompenses avis / follow). */
export function addTicketsForEngagement(businessId, memberId, tickets, actionType, completionId) {
  if (!tickets || tickets < 1) return;
  const wallet = ensureMemberTicketWallet(businessId, memberId);
  const nextBalance = (Number(wallet?.ticket_balance) || 0) + tickets;
  db.prepare(
    "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
  ).run(nextBalance, memberId, businessId);
  db.prepare(
    `INSERT INTO ticket_ledger
     (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
     VALUES (?, ?, ?, 'engagement', ?, ?, 'engagement_completion', ?, NULL, ?, datetime('now'))`
  ).run(
    randomUUID(),
    businessId,
    memberId,
    tickets,
    nextBalance,
    completionId,
    JSON.stringify({ action_type: actionType })
  );
}

export function getGameByCode(gameCode = "roulette") {
  return db.prepare("SELECT * FROM games WHERE code = ? AND active = 1").get(gameCode) || null;
}

export function ensureBusinessGame(businessId, gameCode = "roulette") {
  const game = getGameByCode(gameCode);
  if (!game) return null;
  const existing = db
    .prepare(
      `SELECT bg.*, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.business_id = ? AND bg.game_id = ?`
    )
    .get(businessId, game.id);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO business_games
     (id, business_id, game_id, enabled, ticket_cost, daily_spin_limit, cooldown_seconds, weight_profile_json, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, 20, 10, ?, datetime('now'), datetime('now'))`
  ).run(id, businessId, game.id, JSON.stringify({ profile: "default" }));
  return db
    .prepare(
      `SELECT bg.*, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.id = ?`
    )
    .get(id);
}

export function seedDefaultGameRewards(businessId, gameId) {
  const count = db
    .prepare("SELECT COUNT(*) as n FROM game_rewards WHERE business_id = ? AND game_id = ?")
    .get(businessId, gameId)?.n;
  if ((count || 0) > 0) return;
  const rows = [
    { code: "no_reward", label: "Pas de lot", kind: "none", weight: 65, value: null },
    { code: "small_points", label: "10 points bonus", kind: "points", weight: 25, value: { points: 10 } },
    { code: "medium_points", label: "25 points bonus", kind: "points", weight: 8, value: { points: 25 } },
    { code: "big_points", label: "50 points bonus", kind: "points", weight: 2, value: { points: 50 } },
  ];
  const stmt = db.prepare(
    `INSERT INTO game_rewards
     (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, datetime('now'))`
  );
  for (const row of rows) {
    stmt.run(
      randomUUID(),
      businessId,
      gameId,
      row.code,
      row.label,
      row.kind,
      row.value ? JSON.stringify(row.value) : null,
      row.weight
    );
  }
}

export function pickWeightedReward(rewards) {
  const active = rewards.filter((r) => r.active && Number(r.weight) > 0);
  if (active.length === 0) return null;
  const totalWeight = active.reduce((sum, r) => sum + Number(r.weight), 0);
  if (totalWeight <= 0) return null;
  let cursor = Math.random() * totalWeight;
  for (const reward of active) {
    cursor -= Number(reward.weight);
    if (cursor <= 0) return reward;
  }
  return active[active.length - 1];
}
