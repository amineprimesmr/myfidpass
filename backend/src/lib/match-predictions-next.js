/**
 * Sélection du prochain match ouvert aux pronostics (un seul affiché côté client).
 */

import { enrichMatchWithTeamFlags } from "./world-cup-team-flags.js";

/**
 * @param {Array<Record<string, unknown>>} rows — lignes DB ou DTO publics
 * @param {number} [nowMs]
 */
export function pickNextOpenMatchRow(rows, nowMs = Date.now()) {
  const list = Array.isArray(rows) ? rows : [];
  const candidates = list
    .filter((m) => Number(m.active ?? 1) === 1)
    .filter((m) => Number(m.predictions_open ?? 1) === 1)
    .filter((m) => String(m.status || "scheduled") === "scheduled")
    .filter((m) => {
      const cutoff = Date.parse(String(m.cutoff_at || ""));
      return Number.isFinite(cutoff) && cutoff > nowMs;
    })
    .sort((a, b) => Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at)));
  return candidates[0] || null;
}

/** @param {Record<string, unknown> | null} match */
export function enrichNextMatchForApi(match) {
  if (!match) return null;
  return enrichMatchWithTeamFlags(match);
}
