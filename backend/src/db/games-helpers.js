/**
 * Helpers internes pour games (wallets, rewards, tirage). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getBusinessById, resolveBusinessProgramType } from "./businesses.js";

const db = getDb();

/**
 * Même logique que le front (`isUnlimitedTicketsTest`) : sur localhost / 127.0.0.1,
 * ne pas exiger ni consommer de tickets au spin (démo & dev).
 * Désactiver : FIDPASS_LOCAL_UNLIMITED_TICKETS=0
 * Forcer (ex. NODE_ENV=production en local) : FIDPASS_LOCAL_UNLIMITED_TICKETS=1
 *
 * @param {string | undefined} hostHeader Host ou X-Forwarded-Host (ex. localhost:5174)
 */
export function shouldSkipTicketConsumptionForLocalDev(hostHeader) {
  const raw = String(hostHeader || "").trim().toLowerCase();
  /* IPv6 [::1]:port → bracket form */
  const host = raw.startsWith("[")
    ? raw.slice(1, raw.indexOf("]")) || raw
    : raw.split(":")[0];
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local) return false;
  if (process.env.FIDPASS_LOCAL_UNLIMITED_TICKETS === "0") return false;
  if (process.env.FIDPASS_LOCAL_UNLIMITED_TICKETS === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Front Vite (localhost) qui appelle l’API distante : Host = api.*, mais Origin = http://localhost:5174.
 * Désactiver tout le bloc : FIDPASS_LOCAL_UNLIMITED_TICKETS=0
 * API prod + bloquer ce mode : FIDPASS_BLOCK_LOCAL_ORIGIN_UNLIMITED_SPINS=1
 * ?tickets=unlimited sur hôte non-local : en-tête X-Fidpass-Unlimited-Tickets-Demo: 1 + FIDPASS_TRUST_REMOTE_UNLIMITED_TICKETS_HEADER=1
 *
 * @param {import("express").Request} req
 */
export function shouldSkipTicketConsumptionForLocalBrowser(req) {
  if (process.env.FIDPASS_LOCAL_UNLIMITED_TICKETS === "0") return false;

  const demoHeader = String(req.get("x-fidpass-unlimited-tickets-demo") || "").trim() === "1";
  if (demoHeader && process.env.FIDPASS_TRUST_REMOTE_UNLIMITED_TICKETS_HEADER === "1") return true;

  const candidates = [req.get("origin"), req.get("referer")].filter(Boolean);
  for (const raw of candidates) {
    try {
      const u = new URL(String(raw));
      const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
        if (process.env.NODE_ENV === "production" && process.env.FIDPASS_BLOCK_LOCAL_ORIGIN_UNLIMITED_SPINS === "1") {
          return false;
        }
        return true;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return false;
}

/** Roue active ou mode « points → tickets » : bonus ticket (bienvenue, profil, etc.). */
export function businessUsesTicketBonuses(businessId) {
  const business = getBusinessById(businessId);
  if (!business) return false;
  const pt = resolveBusinessProgramType(business);
  if (pt !== "points" && pt !== "stamps") return false;
  const row = db
    .prepare(
      `SELECT bg.enabled FROM business_games bg
       INNER JOIN games g ON g.id = bg.game_id AND g.code = 'roulette' AND g.active = 1
       WHERE bg.business_id = ? LIMIT 1`
    )
    .get(businessId);
  const rouletteOn = row && Number(row.enabled) === 1;
  const gameTicketsMode = (business.loyalty_mode || "points_cash") === "points_game_tickets";
  return Boolean(rouletteOn || gameTicketsMode);
}

function grantWelcomeTicketIfEligible(businessId, memberId) {
  if (!businessUsesTicketBonuses(businessId)) return;
  const wallet = db
    .prepare("SELECT ticket_balance FROM member_ticket_wallets WHERE member_id = ? AND business_id = ?")
    .get(memberId, businessId);
  if (!wallet || Number(wallet.ticket_balance) !== 0) return;
  const ledgerCount =
    db.prepare("SELECT COUNT(*) as n FROM ticket_ledger WHERE business_id = ? AND member_id = ?").get(businessId, memberId)?.n || 0;
  if (ledgerCount > 0) return;
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE member_ticket_wallets SET ticket_balance = 1, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
    ).run(memberId, businessId);
    db.prepare(
      `INSERT INTO ticket_ledger
       (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
       VALUES (?, ?, ?, 'welcome', 1, 1, 'welcome', NULL, NULL, ?, datetime('now'))`
    ).run(randomUUID(), businessId, memberId, JSON.stringify({ reason: "first_wallet" }));
  });
  tx();
}

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
  db.prepare(
    "INSERT OR IGNORE INTO member_ticket_wallets (member_id, business_id, ticket_balance, updated_at) VALUES (?, ?, 0, datetime('now'))"
  ).run(memberId, businessId);
  grantWelcomeTicketIfEligible(businessId, memberId);
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

/** +1 ticket pour formulaire « complète ton profil » (ledger distinct de l’engagement). */
export function addTicketsForProfileComplete(businessId, memberId, tickets) {
  if (!tickets || tickets < 1) return;
  const wallet = ensureMemberTicketWallet(businessId, memberId);
  const nextBalance = (Number(wallet?.ticket_balance) || 0) + tickets;
  db.prepare(
    "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
  ).run(nextBalance, memberId, businessId);
  const ledgerId = randomUUID();
  db.prepare(
    `INSERT INTO ticket_ledger
     (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
     VALUES (?, ?, ?, 'profile_complete', ?, ?, 'member_profile', ?, NULL, ?, datetime('now'))`
  ).run(ledgerId, businessId, memberId, tickets, nextBalance, memberId, JSON.stringify({ reason: "profile_complete_bonus" }));
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

/** Lots roulette : uniquement points bonus ou « perdant » (pas de réduction / cadeau commerce). */
export const DEFAULT_ROULETTE_POINT_REWARDS = [
  { code: "no_reward", label: "PERDU", kind: "none", weight: 65, value: null },
  { code: "p10", label: "+10 pts", kind: "points", weight: 25, value: { points: 10 } },
  { code: "p25", label: "+25 pts", kind: "points", weight: 8, value: { points: 25 } },
  { code: "p50", label: "+50 pts", kind: "points", weight: 2, value: { points: 50 } },
];

/** Lots roulette programme tampons : passages (même colonne `members.points` que les tampons carte). */
export const DEFAULT_ROULETTE_STAMP_REWARDS = [
  { code: "no_reward", label: "PERDU", kind: "none", weight: 65, value: null },
  { code: "s1", label: "+1 passage", kind: "stamps", weight: 28, value: { stamps: 1 } },
  { code: "s2", label: "+2 passages", kind: "stamps", weight: 7, value: { stamps: 2 } },
];

export function seedDefaultGameRewards(businessId, gameId) {
  const count = db
    .prepare("SELECT COUNT(*) as n FROM game_rewards WHERE business_id = ? AND game_id = ?")
    .get(businessId, gameId)?.n;
  if ((count || 0) > 0) return;
  const rows = DEFAULT_ROULETTE_POINT_REWARDS;
  const stmt = db.prepare(
    `INSERT INTO game_rewards
     (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, datetime('now'))`
  );
  for (const row of rows) {
    stmt.run(randomUUID(), businessId, gameId, row.code, row.label, row.kind, row.value ? JSON.stringify(row.value) : null, row.weight);
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
