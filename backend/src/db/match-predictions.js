import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { addPoints, getMemberForBusiness } from "./members.js";
import { createTransaction, getTransactionByIdempotencyKey } from "./transactions.js";
import { getGameByCode } from "./games-helpers.js";

const db = getDb();

const CHOICES = new Set(["home", "draw", "away"]);
const DEFAULT_POINTS = 10;

function normalizeChoice(value) {
  const choice = String(value || "").trim().toLowerCase();
  return CHOICES.has(choice) ? choice : null;
}

function toBool(value) {
  return Number(value) === 1 || value === true;
}

function parseProfile(row) {
  try {
    const parsed = JSON.parse(row?.weight_profile_json || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function pointsFromBusinessGame(row) {
  const profile = parseProfile(row);
  const n = Math.floor(Number(profile.points_per_correct_prediction ?? profile.pointsPerCorrectPrediction));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : DEFAULT_POINTS;
}

function publicMatch(row, entry = null) {
  const locked =
    Date.parse(row.cutoff_at) <= Date.now() ||
    Number(row.predictions_open ?? 1) === 0 ||
    row.status !== "scheduled";
  return {
    id: row.id,
    code: row.code,
    external_id: row.external_id || null,
    title: row.title,
    team_home: row.team_home,
    team_away: row.team_away,
    starts_at: row.starts_at,
    cutoff_at: row.cutoff_at,
    status: row.status,
    stage: row.stage || "group",
    group_code: row.group_code || null,
    round_label: row.round_label || null,
    venue: row.venue || null,
    predictions_open: Number(row.predictions_open ?? 1) === 1,
    result_choice: row.result_choice || null,
    locked,
    prediction: entry
      ? {
          id: entry.id,
          predicted_choice: entry.predicted_choice,
          points_awarded: Number(entry.points_awarded) || 0,
          scored_at: entry.scored_at || null,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
        }
      : null,
  };
}

function dashboardMatch(row) {
  return {
    ...publicMatch(row),
    entries_count: Number(row.entries_count) || 0,
    correct_count: Number(row.correct_count) || 0,
    points_distributed: Number(row.points_distributed) || 0,
  };
}

export function ensureMatchPredictionsGameForBusiness(businessId) {
  const game = getGameByCode("match_predictions");
  if (!game) return null;
  const existing = db
    .prepare(
      `SELECT bg.*, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.business_id = ? AND bg.game_id = ?`,
    )
    .get(businessId, game.id);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO business_games
     (id, business_id, game_id, enabled, ticket_cost, daily_spin_limit, cooldown_seconds, weight_profile_json, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, 0, ?, datetime('now'), datetime('now'))`,
  ).run(id, businessId, game.id, JSON.stringify({ points_per_correct_prediction: DEFAULT_POINTS }));
  return db
    .prepare(
      `SELECT bg.*, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.id = ?`,
    )
    .get(id);
}

export function getMatchPredictionConfig(businessId) {
  const row = ensureMatchPredictionsGameForBusiness(businessId);
  if (!row) return null;
  return {
    enabled: toBool(row.enabled),
    points_per_correct_prediction: pointsFromBusinessGame(row),
    updated_at: row.updated_at,
  };
}

export function updateMatchPredictionConfig(businessId, updates = {}) {
  const row = ensureMatchPredictionsGameForBusiness(businessId);
  if (!row) return null;
  const enabled = updates.enabled == null ? Number(row.enabled) : updates.enabled ? 1 : 0;
  const currentProfile = parseProfile(row);
  const rawPoints = updates.points_per_correct_prediction ?? updates.pointsPerCorrectPrediction;
  const points = Math.floor(Number(rawPoints));
  const profile = {
    ...currentProfile,
    points_per_correct_prediction: Number.isFinite(points) && points > 0 ? Math.min(points, 500) : pointsFromBusinessGame(row),
  };
  db.prepare(
    "UPDATE business_games SET enabled = ?, weight_profile_json = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(enabled, JSON.stringify(profile), row.id);
  return getMatchPredictionConfig(businessId);
}

export function listMatchPredictionMatchesForMember(businessId, memberId) {
  const config = getMatchPredictionConfig(businessId);
  const matches = db
    .prepare(
      `SELECT * FROM match_prediction_matches
       WHERE active = 1
       ORDER BY datetime(starts_at) ASC, sort_order ASC`,
    )
    .all();
  const entries = memberId
    ? db
        .prepare(
          `SELECT * FROM match_prediction_entries
           WHERE business_id = ? AND member_id = ?`,
        )
        .all(businessId, memberId)
    : [];
  const byMatchId = new Map(entries.map((entry) => [entry.match_id, entry]));
  return {
    enabled: Boolean(config?.enabled),
    points_per_correct_prediction: config?.points_per_correct_prediction ?? DEFAULT_POINTS,
    matches: matches.map((match) => publicMatch(match, byMatchId.get(match.id))),
  };
}

export function submitMatchPrediction({ businessId, memberId, matchId, choice }) {
  const config = getMatchPredictionConfig(businessId);
  if (!config?.enabled) return { error: "challenge_disabled" };
  const member = getMemberForBusiness(memberId, businessId);
  if (!member) return { error: "member_not_found" };
  const normalizedChoice = normalizeChoice(choice);
  if (!normalizedChoice) return { error: "invalid_choice" };
  const match = db.prepare("SELECT * FROM match_prediction_matches WHERE id = ? AND active = 1").get(matchId);
  if (!match) return { error: "match_not_found" };
  if (Number(match.predictions_open ?? 1) === 0) return { error: "match_locked" };
  if (Date.parse(match.cutoff_at) <= Date.now()) return { error: "match_locked" };
  if (match.status !== "scheduled") return { error: "match_locked" };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO match_prediction_entries
     (id, business_id, member_id, match_id, predicted_choice, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(business_id, member_id, match_id)
     DO UPDATE SET predicted_choice = excluded.predicted_choice, updated_at = datetime('now')`,
  ).run(id, businessId, memberId, matchId, normalizedChoice);
  const entry = db
    .prepare("SELECT * FROM match_prediction_entries WHERE business_id = ? AND member_id = ? AND match_id = ?")
    .get(businessId, memberId, matchId);
  return { entry: publicMatch(match, entry) };
}

export function listMatchPredictionDashboard(businessId) {
  const config = getMatchPredictionConfig(businessId);
  const matches = db
    .prepare(
      `SELECT m.*,
              COUNT(e.id) as entries_count,
              SUM(CASE WHEN m.result_choice IS NOT NULL AND e.predicted_choice = m.result_choice THEN 1 ELSE 0 END) as correct_count,
              SUM(COALESCE(e.points_awarded, 0)) as points_distributed
       FROM match_prediction_matches m
       LEFT JOIN match_prediction_entries e ON e.match_id = m.id AND e.business_id = ?
       WHERE m.active = 1
       GROUP BY m.id
       ORDER BY datetime(m.starts_at) ASC, m.sort_order ASC`,
    )
    .all(businessId);
  return {
    config,
    matches: matches.map(dashboardMatch),
  };
}

export function getMatchPredictionEntriesForMatch(businessId, matchId) {
  return db
    .prepare(
      `SELECT e.*, m.name as member_name, m.email as member_email
       FROM match_prediction_entries e
       JOIN members m ON m.id = e.member_id AND m.business_id = e.business_id
       WHERE e.business_id = ? AND e.match_id = ?
       ORDER BY e.updated_at DESC`,
    )
    .all(businessId, matchId);
}

export function setMatchPredictionResult({ businessId, matchId, resultChoice, actorUserId = null }) {
  const choice = normalizeChoice(resultChoice);
  if (!choice) return { error: "invalid_choice" };
  const config = getMatchPredictionConfig(businessId);
  if (!config) return { error: "challenge_unavailable" };
  const match = db.prepare("SELECT * FROM match_prediction_matches WHERE id = ? AND active = 1").get(matchId);
  if (!match) return { error: "match_not_found" };
  if (match.result_choice && match.result_choice !== choice) {
    const awarded = db
      .prepare(
        "SELECT COUNT(*) as n FROM match_prediction_entries WHERE business_id = ? AND match_id = ? AND points_awarded > 0",
      )
      .get(businessId, matchId)?.n;
    if (Number(awarded) > 0) return { error: "result_already_scored" };
  }
  db.prepare(
    "UPDATE match_prediction_matches SET result_choice = ?, status = 'scored', updated_at = datetime('now') WHERE id = ?",
  ).run(choice, matchId);
  return scoreMatchPredictions({ businessId, matchId, actorUserId });
}

export function scoreMatchPredictions({ businessId, matchId, actorUserId = null }) {
  const config = getMatchPredictionConfig(businessId);
  if (!config) return { error: "challenge_unavailable" };
  const match = db.prepare("SELECT * FROM match_prediction_matches WHERE id = ? AND active = 1").get(matchId);
  if (!match) return { error: "match_not_found" };
  const resultChoice = normalizeChoice(match.result_choice);
  if (!resultChoice) return { error: "missing_result" };
  const points = config.points_per_correct_prediction || DEFAULT_POINTS;
  const entries = db
    .prepare(
      `SELECT * FROM match_prediction_entries
       WHERE business_id = ? AND match_id = ? AND predicted_choice = ?`,
    )
    .all(businessId, matchId, resultChoice);
  let awarded = 0;
  const tx = db.transaction(() => {
    for (const entry of entries) {
      if (Number(entry.points_awarded) > 0) continue;
      const key = `match_prediction:${businessId}:${matchId}:${entry.member_id}`;
      if (getTransactionByIdempotencyKey(businessId, key)) {
        db.prepare(
          "UPDATE match_prediction_entries SET points_awarded = ?, scored_at = COALESCE(scored_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
        ).run(points, entry.id);
        continue;
      }
      addPoints(entry.member_id, points);
      createTransaction({
        businessId,
        memberId: entry.member_id,
        type: "points_add",
        points,
        idempotencyKey: key,
        actorUserId,
        metadata: {
          source: "match_prediction",
          match_id: matchId,
          match_title: match.title,
          predicted_choice: entry.predicted_choice,
          result_choice: resultChoice,
        },
      });
      db.prepare(
        "UPDATE match_prediction_entries SET points_awarded = ?, scored_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).run(points, entry.id);
      awarded += 1;
    }
    db.prepare("UPDATE match_prediction_matches SET status = 'scored', updated_at = datetime('now') WHERE id = ?").run(matchId);
  });
  tx();
  return {
    ok: true,
    match: db.prepare("SELECT * FROM match_prediction_matches WHERE id = ?").get(matchId),
    awarded_count: awarded,
    correct_count: entries.length,
    points_per_correct_prediction: points,
  };
}
