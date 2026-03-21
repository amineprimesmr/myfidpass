/**
 * Repository games (roulette, tickets, spins, rewards). Référence : REFONTE-REGLES.md.
 * Dérogation 2026-03-21 : fichier > 400 lignes — à scinder (ex. games-roulette-public.js) si évolution.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getBusinessById } from "./businesses.js";
import { getMemberForBusiness, getMember, addPoints, addStampsCapped } from "./members.js";
import { createTransaction } from "./transactions.js";
import {
  parseJsonSafe,
  getDefaultPointsPerTicket,
  ensureMemberTicketWallet,
  ensureBusinessGame,
  seedDefaultGameRewards,
  pickWeightedReward,
  DEFAULT_ROULETTE_POINT_REWARDS,
  DEFAULT_ROULETTE_STAMP_REWARDS,
} from "./games-helpers.js";

export { addTicketsForEngagement } from "./games-helpers.js";

const db = getDb();

export function getBusinessGames(businessId) {
  const base = ensureBusinessGame(businessId, "roulette");
  if (base) seedDefaultGameRewards(businessId, base.game_id);
  const rows = db
    .prepare(
      `SELECT bg.id, bg.business_id, bg.enabled, bg.ticket_cost, bg.daily_spin_limit, bg.cooldown_seconds,
              bg.weight_profile_json, bg.updated_at,
              g.id as game_id, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.business_id = ?
       ORDER BY g.code ASC`
    )
    .all(businessId);
  return rows.map((row) => ({
    ...row,
    enabled: Number(row.enabled) === 1,
    ticket_cost: Number(row.ticket_cost) || 1,
    daily_spin_limit: Number(row.daily_spin_limit) || 0,
    cooldown_seconds: Number(row.cooldown_seconds) || 0,
    weight_profile: parseJsonSafe(row.weight_profile_json, { profile: "default" }) || { profile: "default" },
  }));
}

export function updateBusinessGameConfig(businessId, gameCode, updates = {}) {
  const bg = ensureBusinessGame(businessId, gameCode);
  if (!bg) return null;
  const allowed = ["enabled", "ticket_cost", "daily_spin_limit", "cooldown_seconds", "weight_profile_json"];
  const sets = [];
  const values = [];
  for (const [k, raw] of Object.entries(updates)) {
    if (!allowed.includes(k) || raw === undefined) continue;
    if (k === "enabled") {
      sets.push("enabled = ?");
      values.push(raw ? 1 : 0);
    } else if (k === "weight_profile_json") {
      sets.push("weight_profile_json = ?");
      values.push(raw == null ? null : (typeof raw === "string" ? raw : JSON.stringify(raw)));
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) continue;
      sets.push(`${k} = ?`);
      values.push(Math.floor(n));
    }
  }
  if (sets.length === 0) {
    return getBusinessGames(businessId).find((g) => g.game_code === gameCode) || null;
  }
  values.push(bg.id);
  db.prepare(`UPDATE business_games SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  return getBusinessGames(businessId).find((g) => g.game_code === gameCode) || null;
}

export function getGameRewardsForBusiness(businessId, gameCode = "roulette") {
  const bg = ensureBusinessGame(businessId, gameCode);
  if (!bg) return [];
  seedDefaultGameRewards(businessId, bg.game_id);
  const rows = db
    .prepare(
      `SELECT id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at
       FROM game_rewards
       WHERE business_id = ? AND game_id = ?
       ORDER BY weight DESC, created_at ASC`
    )
    .all(businessId, bg.game_id);
  return rows.map((row) => ({
    ...row,
    value: parseJsonSafe(row.value_json, null),
    active: Number(row.active) === 1,
    weight: Number(row.weight) || 0,
  }));
}

/**
 * Roulette : uniquement kind "none" ou "points" (bonus sur la carte).
 * Réinitialise avec les défauts si config invalide ou aucun segment jouable.
 */
export function ensureRoulettePointsOnlyRewards(businessId) {
  const bg = ensureBusinessGame(businessId, "roulette");
  if (!bg) return;
  seedDefaultGameRewards(businessId, bg.game_id);
  const rows = getGameRewardsForBusiness(businessId, "roulette");
  const hasForbiddenKind = rows.some((r) => r.kind !== "none" && r.kind !== "points");
  const playable = rows.filter((r) => r.active && Number(r.weight) > 0 && (r.kind === "none" || r.kind === "points"));
  if (hasForbiddenKind || playable.length === 0) {
    replaceGameRewardsForBusiness(businessId, "roulette", DEFAULT_ROULETTE_POINT_REWARDS);
  }
}

export function ensureRouletteStampsOnlyRewards(businessId) {
  const bg = ensureBusinessGame(businessId, "roulette");
  if (!bg) return;
  seedDefaultGameRewards(businessId, bg.game_id);
  const rows = getGameRewardsForBusiness(businessId, "roulette");
  const hasForbiddenKind = rows.some((r) => r.kind !== "none" && r.kind !== "stamps");
  const playable = rows.filter((r) => r.active && Number(r.weight) > 0 && (r.kind === "none" || r.kind === "stamps"));
  if (hasForbiddenKind || playable.length === 0) {
    replaceGameRewardsForBusiness(businessId, "roulette", DEFAULT_ROULETTE_STAMP_REWARDS);
  }
}

export function ensureRouletteRewardsForProgram(businessId, programType) {
  const pt = String(programType || "points").toLowerCase();
  if (pt === "stamps") ensureRouletteStampsOnlyRewards(businessId);
  else ensureRoulettePointsOnlyRewards(businessId);
}

export function getRoulettePublicSegments(businessId, programType = "points") {
  const pt = String(programType || "points").toLowerCase();
  ensureRouletteRewardsForProgram(businessId, pt);
  const kindOk = pt === "stamps" ? (k) => k === "none" || k === "stamps" : (k) => k === "none" || k === "points";
  return getGameRewardsForBusiness(businessId, "roulette")
    .filter((r) => r.active && Number(r.weight) > 0 && kindOk(r.kind))
    .map((r) => ({
      label: (String(r.label || "").trim() || (r.kind === "none" ? "PERDU" : "?")).slice(0, 120),
      kind: r.kind,
    }));
}

export function replaceGameRewardsForBusiness(businessId, gameCode = "roulette", rewards = []) {
  const bg = ensureBusinessGame(businessId, gameCode);
  if (!bg) return [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM game_rewards WHERE business_id = ? AND game_id = ?").run(businessId, bg.game_id);
    const insert = db.prepare(
      `INSERT INTO game_rewards
       (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    for (const reward of rewards) {
      const id = randomUUID();
      const code = String(reward.code || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 40);
      if (!code) continue;
      const label = String(reward.label || code).trim().slice(0, 120);
      const kind =
        reward.kind === "points" ? "points" : reward.kind === "stamps" ? "stamps" : reward.kind === "none" ? "none" : null;
      if (!kind) continue;
      const weight = Math.max(0, Number(reward.weight) || 0);
      const stock = reward.stock == null ? null : Math.max(0, Number(reward.stock) || 0);
      const active = reward.active === false ? 0 : 1;
      let valueJson = null;
      if (kind === "points") {
        const pts = Math.floor(Number(reward.value?.points));
        if (!Number.isFinite(pts) || pts < 0) continue;
        valueJson = JSON.stringify({ points: pts });
      } else if (kind === "stamps") {
        const st = Math.floor(Number(reward.value?.stamps));
        if (!Number.isFinite(st) || st < 1) continue;
        valueJson = JSON.stringify({ stamps: st });
      }
      insert.run(id, businessId, bg.game_id, code, label, kind, valueJson, stock, active, weight);
    }
  });
  tx();
  const fresh = getGameRewardsForBusiness(businessId, gameCode);
  if (fresh.length === 0) {
    seedDefaultGameRewards(businessId, bg.game_id);
    return getGameRewardsForBusiness(businessId, gameCode);
  }
  return fresh;
}

export function getMemberTicketWallet(businessId, memberId) {
  return ensureMemberTicketWallet(businessId, memberId);
}

export function getMemberTicketHistory(businessId, memberId, limit = 30) {
  return db
    .prepare(
      `SELECT id, source_type, delta, balance_after, reference_type, reference_id, metadata_json, created_at
       FROM ticket_ledger
       WHERE business_id = ? AND member_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(businessId, memberId, Math.max(1, Math.min(100, Number(limit) || 30)))
    .map((row) => ({ ...row, metadata: parseJsonSafe(row.metadata_json, null) }));
}

export function convertPointsToTickets({
  businessId,
  memberId,
  pointsToConvert,
  idempotencyKey = null,
  metadata = null,
}) {
  const business = getBusinessById(businessId);
  if (!business) return { error: "business_not_found" };
  if (String(business.program_type || "").toLowerCase() === "stamps") {
    return { error: "mode_disabled" };
  }
  if ((business.loyalty_mode || "points_cash") !== "points_game_tickets") {
    return { error: "mode_disabled" };
  }
  const pts = Math.floor(Number(pointsToConvert) || 0);
  const pointsPerTicket = getDefaultPointsPerTicket(business);
  if (pts <= 0 || pts < pointsPerTicket) return { error: "invalid_points" };
  const tx = db.transaction(() => {
    if (idempotencyKey) {
      const existingLedger = db
        .prepare("SELECT * FROM ticket_ledger WHERE business_id = ? AND idempotency_key = ? LIMIT 1")
        .get(businessId, idempotencyKey);
      if (existingLedger) {
        return {
          ok: true,
          idempotent: true,
          wallet: ensureMemberTicketWallet(businessId, memberId),
          member: getMember(memberId),
          converted_points: 0,
          tickets_added: 0,
        };
      }
    }
    const member = getMemberForBusiness(memberId, businessId);
    if (!member) return { error: "member_not_found" };
    if ((Number(member.points) || 0) < pts) return { error: "not_enough_points" };
    const tickets = Math.floor(pts / pointsPerTicket);
    const pointsUsed = tickets * pointsPerTicket;
    if (tickets <= 0 || pointsUsed <= 0) return { error: "invalid_points" };

    const wallet = ensureMemberTicketWallet(businessId, memberId);
    const nextBalance = (Number(wallet?.ticket_balance) || 0) + tickets;
    db.prepare(
      "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
    ).run(nextBalance, memberId, businessId);
    db.prepare(
      "UPDATE members SET points = points - ?, last_visit_at = datetime('now') WHERE id = ? AND business_id = ?"
    ).run(pointsUsed, memberId, businessId);
    createTransaction({
      businessId,
      memberId,
      type: "points_redeem_game_tickets",
      points: -pointsUsed,
      metadata: { source: "game_tickets_convert", tickets_added: tickets, points_per_ticket: pointsPerTicket },
    });
    db.prepare(
      `INSERT INTO ticket_ledger
       (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
       VALUES (?, ?, ?, 'convert', ?, ?, 'points', ?, ?, ?, datetime('now'))`
    ).run(
      randomUUID(),
      businessId,
      memberId,
      tickets,
      nextBalance,
      memberId,
      idempotencyKey || null,
      metadata == null ? null : JSON.stringify(metadata)
    );
    return {
      ok: true,
      idempotent: false,
      wallet: ensureMemberTicketWallet(businessId, memberId),
      member: getMemberForBusiness(memberId, businessId),
      converted_points: pointsUsed,
      tickets_added: tickets,
    };
  });
  return tx();
}

export function spinGameForMember({
  businessId,
  memberId,
  gameCode = "roulette",
  idempotencyKey = null,
  clientIpHash = null,
  deviceHash = null,
  riskScore = 0,
}) {
  const tx = db.transaction(() => {
    if (idempotencyKey) {
      const existing = db
        .prepare(
          `SELECT s.*, w.ticket_balance
           FROM game_spins s
           LEFT JOIN member_ticket_wallets w ON w.member_id = s.member_id AND w.business_id = s.business_id
           WHERE s.business_id = ? AND s.idempotency_key = ? LIMIT 1`
        )
        .get(businessId, idempotencyKey);
      if (existing) {
        const reward = existing.reward_id
          ? db.prepare("SELECT * FROM game_rewards WHERE id = ?").get(existing.reward_id)
          : null;
        return {
          ok: true,
          idempotent: true,
          spin: existing,
          reward: reward ? { ...reward, value: parseJsonSafe(reward.value_json, null), active: Number(reward.active) === 1 } : null,
          ticket_balance: Number(existing.ticket_balance) || 0,
        };
      }
    }
    const business = getBusinessById(businessId);
    if (!business) return { error: "business_not_found" };
    const programType = String(business.program_type || "points").toLowerCase();
    if (programType !== "points" && programType !== "stamps") {
      return { error: "mode_disabled" };
    }
    const member = getMemberForBusiness(memberId, businessId);
    if (!member) return { error: "member_not_found" };
    const game = ensureBusinessGame(businessId, gameCode);
    if (!game || !game.enabled) return { error: "game_disabled" };
    seedDefaultGameRewards(businessId, game.game_id);
    const wallet = ensureMemberTicketWallet(businessId, memberId);
    const ticketCost = Math.max(1, Number(game.ticket_cost) || 1);
    const currentBalance = Number(wallet?.ticket_balance) || 0;
    if (currentBalance < ticketCost) return { error: "not_enough_tickets", ticket_cost: ticketCost, ticket_balance: currentBalance };

    const dailyLimit = Math.max(0, Number(game.daily_spin_limit) || 0);
    if (dailyLimit > 0) {
      const todayCount = db
        .prepare(
          `SELECT COUNT(*) as n FROM game_spins
           WHERE business_id = ? AND member_id = ? AND game_id = ?
             AND created_at >= datetime('now', 'start of day')`
        )
        .get(businessId, memberId, game.game_id)?.n;
      if ((todayCount || 0) >= dailyLimit) return { error: "daily_limit_reached" };
    }
    const cooldownSeconds = Math.max(0, Number(game.cooldown_seconds) || 0);
    if (cooldownSeconds > 0) {
      const lastSpin = db
        .prepare(
          `SELECT id FROM game_spins
           WHERE business_id = ? AND member_id = ? AND game_id = ?
             AND created_at >= datetime('now', '-' || ? || ' seconds')
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(businessId, memberId, game.game_id, cooldownSeconds);
      if (lastSpin) return { error: "cooldown_active", cooldown_seconds: cooldownSeconds };
    }

    const nextBalance = currentBalance - ticketCost;
    db.prepare(
      "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
    ).run(nextBalance, memberId, businessId);
    const spinId = randomUUID();
    db.prepare(
      `INSERT INTO ticket_ledger
       (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
       VALUES (?, ?, ?, 'consume', ?, ?, 'spin', ?, ?, ?, datetime('now'))`
    ).run(
      randomUUID(),
      businessId,
      memberId,
      -ticketCost,
      nextBalance,
      spinId,
      idempotencyKey || null,
      JSON.stringify({ game_code: gameCode, ticket_cost: ticketCost })
    );

    ensureRouletteRewardsForProgram(businessId, programType);
    const kindFilter =
      programType === "stamps"
        ? (r) => r.active && Number(r.weight) > 0 && (r.kind === "none" || r.kind === "stamps")
        : (r) => r.active && Number(r.weight) > 0 && (r.kind === "none" || r.kind === "points");
    const spinRewards = getGameRewardsForBusiness(businessId, gameCode).filter(kindFilter);
    const reward = pickWeightedReward(spinRewards);
    const rawMax = business.required_stamps != null ? Number(business.required_stamps) : 10;
    const maxStamps = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 10;
    let isWinning = false;
    const grantedRewardId = reward?.id || null;
    const outcomeCode = reward?.code || "none";
    let grant = null;
    if (reward && reward.kind === "points") {
      const bonusPoints = Math.max(0, Number(reward.value?.points) || 0);
      if (bonusPoints > 0) {
        isWinning = true;
        addPoints(memberId, bonusPoints);
        createTransaction({
          businessId,
          memberId,
          type: "points_add",
          points: bonusPoints,
          metadata: { source: "game_spin", game_code: gameCode, reward_code: reward.code },
        });
        grant = {
          id: randomUUID(),
          business_id: businessId,
          member_id: memberId,
          spin_id: spinId,
          reward_id: reward.id,
          status: "granted",
          metadata_json: JSON.stringify({ reward_kind: "points", points: bonusPoints }),
        };
      }
    } else if (reward && reward.kind === "stamps") {
      const bonusStamps = Math.max(0, Math.floor(Number(reward.value?.stamps) || 0));
      if (bonusStamps > 0) {
        const { added } = addStampsCapped(memberId, bonusStamps, maxStamps);
        if (added > 0) {
          isWinning = true;
          createTransaction({
            businessId,
            memberId,
            type: "points_add",
            points: added,
            metadata: {
              source: "game_spin",
              game_code: gameCode,
              reward_code: reward.code,
              reward_kind: "stamps",
              stamps_added: added,
            },
          });
          grant = {
            id: randomUUID(),
            business_id: businessId,
            member_id: memberId,
            spin_id: spinId,
            reward_id: reward.id,
            status: "granted",
            metadata_json: JSON.stringify({ reward_kind: "stamps", stamps: added }),
          };
        }
      }
    }
    const status = isWinning ? "won" : "lost";

    db.prepare(
      `INSERT INTO game_spins
       (id, business_id, member_id, game_id, status, ticket_cost, rng_seed_hash, outcome_code, reward_id, idempotency_key, risk_score, client_ip_hash, device_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      spinId,
      businessId,
      memberId,
      game.game_id,
      status,
      ticketCost,
      randomUUID(),
      outcomeCode,
      grantedRewardId,
      idempotencyKey || null,
      Number(riskScore) || 0,
      clientIpHash,
      deviceHash
    );

    if (grant) {
      db.prepare(
        `INSERT INTO reward_grants
         (id, business_id, member_id, spin_id, reward_id, status, granted_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`
      ).run(grant.id, grant.business_id, grant.member_id, grant.spin_id, grant.reward_id, grant.status, grant.metadata_json);
    }

    const freshSpin = db.prepare("SELECT * FROM game_spins WHERE id = ?").get(spinId);
    return {
      ok: true,
      idempotent: false,
      spin: freshSpin,
      reward: reward || null,
      ticket_balance: nextBalance,
      member_points: getMemberForBusiness(memberId, businessId)?.points ?? null,
    };
  });
  return tx();
}

export function getMemberRewards(businessId, memberId, limit = 30) {
  const rows = db
    .prepare(
      `SELECT rg.id, rg.status, rg.granted_at, rg.claimed_at, rg.expires_at, rg.metadata_json,
              gr.code, gr.label, gr.kind, gr.value_json
       FROM reward_grants rg
       JOIN game_rewards gr ON gr.id = rg.reward_id
       WHERE rg.business_id = ? AND rg.member_id = ?
       ORDER BY rg.granted_at DESC
       LIMIT ?`
    )
    .all(businessId, memberId, Math.max(1, Math.min(100, Number(limit) || 30)));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    granted_at: row.granted_at,
    claimed_at: row.claimed_at,
    expires_at: row.expires_at,
    metadata: parseJsonSafe(row.metadata_json, null),
    reward: {
      code: row.code,
      label: row.label,
      kind: row.kind,
      value: parseJsonSafe(row.value_json, null),
    },
  }));
}

export function markRewardGrantClaimed(businessId, memberId, grantId) {
  const grant = db
    .prepare(
      `SELECT * FROM reward_grants
       WHERE id = ? AND business_id = ? AND member_id = ?`
    )
    .get(grantId, businessId, memberId);
  if (!grant || grant.status !== "granted") return null;
  db.prepare(
    "UPDATE reward_grants SET status = 'claimed', claimed_at = datetime('now') WHERE id = ?"
  ).run(grantId);
  return db.prepare("SELECT * FROM reward_grants WHERE id = ?").get(grantId) || null;
}
