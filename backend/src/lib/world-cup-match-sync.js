import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { buildWorldCup2026Catalog } from "./world-cup-2026-catalog.js";

const db = getDb();

/** SQLite `datetime('…T…Z')` renvoie souvent NULL → INSERT échoue (cutoff_at NOT NULL). */
export function cutoffFromStartsAt(startsAt) {
  const ms = Date.parse(String(startsAt || ""));
  if (!Number.isFinite(ms)) return String(startsAt || "");
  return new Date(ms - 15 * 60 * 1000).toISOString();
}

const PLACEHOLDER_RE =
  /à confirmer|vainqueur|perdant|équipe à|tbd|winner|loser/i;

function isPlaceholderTeam(name) {
  return PLACEHOLDER_RE.test(String(name || "").trim());
}

function predictionsOpenForTeams(home, away) {
  return isPlaceholderTeam(home) || isPlaceholderTeam(away) ? 0 : 1;
}

function normalizeStatusFromApi(shortStatus) {
  const s = String(shortStatus || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(s)) return "finished";
  if (["1H", "2H", "HT", "ET", "BT", "LIVE"].includes(s)) return "live";
  if (s === "PST" || s === "CANC") return "cancelled";
  return "scheduled";
}

function resultChoiceFromGoals(homeGoals, awayGoals) {
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

/**
 * @param {import("./world-cup-2026-catalog.js").CatalogMatch} row
 */
function upsertCatalogRow(row, conn = db) {
  const cutoff = cutoffFromStartsAt(row.starts_at);
  const existing = conn
    .prepare("SELECT id, status, result_choice FROM match_prediction_matches WHERE external_id = ?")
    .get(row.external_id);

  const predictionsOpen =
    row.predictions_open != null ? Number(row.predictions_open) : predictionsOpenForTeams(row.team_home, row.team_away);

  if (existing) {
    conn.prepare(
      `UPDATE match_prediction_matches SET
         title = ?,
         team_home = ?,
         team_away = ?,
         starts_at = ?,
         cutoff_at = ?,
         stage = ?,
         group_code = ?,
         round_label = ?,
         venue = COALESCE(?, venue),
         predictions_open = ?,
         sort_order = ?,
         active = 1,
         updated_at = datetime('now')
       WHERE external_id = ?`,
    ).run(
      row.title,
      row.team_home,
      row.team_away,
      row.starts_at,
      cutoff,
      row.stage,
      row.group_code || null,
      row.round_label || null,
      row.venue || null,
      predictionsOpen,
      row.sort_order,
      row.external_id,
    );
    return { action: "updated", id: existing.id };
  }

  const id = randomUUID();
  conn.prepare(
    `INSERT INTO match_prediction_matches
     (id, external_id, code, title, team_home, team_away, starts_at, cutoff_at, status, stage, group_code, round_label, venue, predictions_open, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    id,
    row.external_id,
    row.external_id,
    row.title,
    row.team_home,
    row.team_away,
    row.starts_at,
    cutoff,
    row.stage,
    row.group_code || null,
    row.round_label || null,
    row.venue || null,
    predictionsOpen,
    row.sort_order,
  );
  return { action: "inserted", id };
}

/**
 * @param {Array<Record<string, unknown>>} fixtures
 */
function mapApiFootballFixtures(fixtures) {
  const out = [];
  for (const f of fixtures) {
    const fixture = f.fixture || f;
    const teams = f.teams || {};
    const league = f.league || {};
    const goals = f.goals || {};
    const externalId = `apif-${fixture.id}`;
    const home = teams.home?.name || "Équipe domicile";
    const away = teams.away?.name || "Équipe extérieur";
    const startsAt = fixture.date;
    const stageRaw = String(league.round || "").toLowerCase();
    let stage = "group";
    let roundLabel = league.round || "Coupe du monde 2026";
    if (stageRaw.includes("final") && !stageRaw.includes("semi")) {
      stage = "final";
      roundLabel = "Finale";
    } else if (stageRaw.includes("3rd")) {
      stage = "third_place";
    } else if (stageRaw.includes("semi")) {
      stage = "semi_final";
    } else if (stageRaw.includes("quarter")) {
      stage = "quarter_final";
    } else if (stageRaw.includes("round of 16") || stageRaw.includes("1/8")) {
      stage = "round_of_16";
    } else if (stageRaw.includes("round of 32") || stageRaw.includes("1/16")) {
      stage = "round_of_32";
    }

    const status = normalizeStatusFromApi(fixture.status?.short);
    const resultChoice = status === "finished" ? resultChoiceFromGoals(goals.home, goals.away) : null;

    out.push({
      external_id: externalId,
      api_fixture_id: fixture.id,
      title: roundLabel,
      team_home: home,
      team_away: away,
      starts_at: startsAt,
      stage,
      group_code: null,
      round_label: roundLabel,
      venue: fixture.venue?.name || null,
      predictions_open: predictionsOpenForTeams(home, away),
      sort_order: new Date(startsAt).getTime() / 1000,
      status,
      result_choice: resultChoice,
    });
  }
  return out;
}

async function fetchApiFootballFixtures() {
  const key = String(process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY || "").trim();
  if (!key) return [];

  const leagueId = String(process.env.WORLD_CUP_API_FOOTBALL_LEAGUE_ID || "1").trim();
  const season = String(process.env.WORLD_CUP_API_FOOTBALL_SEASON || "2026").trim();
  const url = `https://v3.football.api-sports.io/fixtures?league=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(season)}`;

  const res = await fetch(url, {
    headers: { "x-apisports-key": key },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const json = await res.json();
  const list = Array.isArray(json?.response) ? json.response : [];
  return mapApiFootballFixtures(list);
}

/**
 * @param {ReturnType<typeof mapApiFootballFixtures>[number]} row
 */
function upsertApiRow(row, conn = db) {
  const cutoff = cutoffFromStartsAt(row.starts_at);
  const existing = conn
    .prepare("SELECT id FROM match_prediction_matches WHERE external_id = ? OR api_fixture_id = ?")
    .get(row.external_id, row.api_fixture_id);

  const predictionsOpen = row.predictions_open;
  const status = row.status || "scheduled";
  const resultChoice = row.result_choice;

  if (existing) {
    conn.prepare(
      `UPDATE match_prediction_matches SET
         external_id = ?,
         api_fixture_id = ?,
         title = ?,
         team_home = ?,
         team_away = ?,
         starts_at = ?,
         cutoff_at = ?,
         stage = ?,
         round_label = ?,
         venue = COALESCE(?, venue),
         predictions_open = ?,
         sort_order = ?,
         status = CASE WHEN status = 'scored' THEN status ELSE ? END,
         result_choice = COALESCE(result_choice, ?),
         active = 1,
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      row.external_id,
      row.api_fixture_id,
      row.title,
      row.team_home,
      row.team_away,
      row.starts_at,
      cutoff,
      row.stage,
      row.round_label,
      row.venue,
      predictionsOpen,
      row.sort_order,
      status,
      resultChoice,
      existing.id,
    );
    return { action: "updated", id: existing.id };
  }

  const id = randomUUID();
  conn.prepare(
    `INSERT INTO match_prediction_matches
     (id, external_id, api_fixture_id, code, title, team_home, team_away, starts_at, cutoff_at, status, result_choice, stage, round_label, venue, predictions_open, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    id,
    row.external_id,
    row.api_fixture_id,
    row.external_id,
    row.title,
    row.team_home,
    row.team_away,
    row.starts_at,
    cutoff,
    status,
    resultChoice,
    row.stage,
    row.round_label,
    row.venue,
    predictionsOpen,
    row.sort_order,
  );
  return { action: "inserted", id };
}

/** Seed synchrone du catalogue local (72 groupes + knockout) — sans appel API. */
export function syncWorldCup2026CatalogSync(conn = db) {
  let inserted = 0;
  let updated = 0;
  for (const row of buildWorldCup2026Catalog()) {
    const r = upsertCatalogRow(row, conn);
    if (r.action === "inserted") inserted += 1;
    else updated += 1;
  }
  return { ok: true, inserted, updated };
}

export function countActiveMatchPredictionMatches(conn = db) {
  return Number(conn.prepare("SELECT COUNT(*) as n FROM match_prediction_matches WHERE active = 1").get()?.n) || 0;
}

/** Même filtre que listMatchPredictionDashboard / espace client. */
export function countListableMatchPredictionMatches(conn = db) {
  return (
    Number(
      conn
        .prepare(
          `SELECT COUNT(*) as n FROM match_prediction_matches
           WHERE active = 1 AND (stage = 'group' OR predictions_open = 1)`,
        )
        .get()?.n,
    ) || 0
  );
}

/** Réactive les lignes legacy (migration v39) pour qu’elles passent le filtre liste. */
function repairLegacyMatchRows(conn = db) {
  conn.prepare(
    `UPDATE match_prediction_matches
     SET active = 1,
         stage = COALESCE(NULLIF(TRIM(stage), ''), 'group'),
         predictions_open = CASE
           WHEN predictions_open = 0 THEN predictions_open
           ELSE COALESCE(predictions_open, 1)
         END
     WHERE code LIKE 'mp-2026-%' OR external_id LIKE 'wc2026-%' OR code LIKE 'wc2026-%'`,
  ).run();
  const broken = conn
    .prepare(
      "SELECT id, starts_at FROM match_prediction_matches WHERE cutoff_at IS NULL OR TRIM(cutoff_at) = ''",
    )
    .all();
  for (const row of broken) {
    const cutoff = cutoffFromStartsAt(row.starts_at);
    if (cutoff) conn.prepare("UPDATE match_prediction_matches SET cutoff_at = ? WHERE id = ?").run(cutoff, row.id);
  }
}

/** Garantit au moins 72 matchs de phase de groupes visibles (critère aligné sur les listes API). */
export function ensureWorldCupCatalogSeeded(conn = db) {
  repairLegacyMatchRows(conn);
  const listable = countListableMatchPredictionMatches(conn);
  const groupCount =
    Number(
      conn.prepare("SELECT COUNT(*) as n FROM match_prediction_matches WHERE active = 1 AND stage = 'group'").get()?.n,
    ) || 0;
  if (listable >= 72 && groupCount >= 72) {
    return { skipped: true, groupCount, listable };
  }
  return { ...syncWorldCup2026CatalogSync(conn), skipped: false, groupCount, listable };
}

/**
 * Synchronise le calendrier Coupe du monde 2026 (catalogue local + API-Football si clé).
 * @returns {Promise<{ ok: boolean; source: string; inserted: number; updated: number; api_rows: number }>}
 */
export async function syncWorldCup2026Matches() {
  let inserted = 0;
  let updated = 0;
  let apiRows = 0;
  let source = "catalog";

  const catalogRun = syncWorldCup2026CatalogSync(db);
  inserted += catalogRun.inserted;
  updated += catalogRun.updated;

  try {
    const apiList = await fetchApiFootballFixtures();
    if (apiList.length > 0) {
      source = "catalog+api-football";
      apiRows = apiList.length;
      for (const row of apiList) {
        const r = upsertApiRow(row);
        if (r.action === "inserted") inserted += 1;
        else updated += 1;
      }
    }
  } catch (err) {
    console.error("[world-cup-sync] API-Football:", err?.message || err);
  }

  return { ok: true, source, inserted, updated, api_rows: apiRows };
}
