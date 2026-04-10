/**
 * Snapshots de métriques sociales / avis (historique pour deltas et graphiques).
 * @module db/social-metrics
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

const MAX_SNAPSHOTS_PER_CHANNEL = 400;

/**
 * @param {string} businessId
 * @param {string} channel - ex. google_review, instagram_follow
 * @param {string} source - google_places | manual | oauth_meta (réservé)
 * @param {object} metrics - { reviews_count?, rating?, followers?, ... }
 */
export function insertSocialMetricSnapshot(businessId, channel, source, metrics) {
  const id = randomUUID();
  const capturedAt = new Date().toISOString();
  const metricsJson = JSON.stringify(metrics && typeof metrics === "object" ? metrics : {});
  db.prepare(
    `INSERT INTO social_metric_snapshots (id, business_id, channel, source, captured_at, metrics_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(id, businessId, String(channel), String(source), capturedAt, metricsJson);
  pruneOldSnapshots(businessId, channel);
  return { id, captured_at: capturedAt, metrics: JSON.parse(metricsJson) };
}

function pruneOldSnapshots(businessId, channel) {
  safeRun(() => {
    db.prepare(
      `DELETE FROM social_metric_snapshots
       WHERE business_id = ? AND channel = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM social_metric_snapshots
             WHERE business_id = ? AND channel = ?
             ORDER BY captured_at DESC
             LIMIT ?
           )
         )`,
    ).run(businessId, channel, businessId, channel, MAX_SNAPSHOTS_PER_CHANNEL);
  });
}

function safeRun(fn) {
  try {
    fn();
  } catch (_e) {
    /* ignore */
  }
}

export function listSnapshotsForChannel(businessId, channel, limit = 60) {
  const lim = Math.min(Math.max(Number(limit) || 60, 1), 200);
  return db
    .prepare(
      `SELECT id, channel, source, captured_at, metrics_json FROM social_metric_snapshots
       WHERE business_id = ? AND channel = ?
       ORDER BY captured_at DESC
       LIMIT ?`,
    )
    .all(businessId, channel, lim);
}

export function getLatestSnapshot(businessId, channel) {
  return db
    .prepare(
      `SELECT id, channel, source, captured_at, metrics_json FROM social_metric_snapshots
       WHERE business_id = ? AND channel = ?
       ORDER BY captured_at DESC LIMIT 1`,
    )
    .get(businessId, channel);
}

export function getBaselineSnapshot(businessId, channel) {
  return db
    .prepare(
      `SELECT id, channel, source, captured_at, metrics_json FROM social_metric_snapshots
       WHERE business_id = ? AND channel = ?
       ORDER BY captured_at ASC LIMIT 1`,
    )
    .get(businessId, channel);
}

export function getPreviousSnapshot(businessId, channel, beforeCapturedAtIso) {
  return db
    .prepare(
      `SELECT id, channel, source, captured_at, metrics_json FROM social_metric_snapshots
       WHERE business_id = ? AND channel = ? AND captured_at < ?
       ORDER BY captured_at DESC LIMIT 1`,
    )
    .get(businessId, channel, beforeCapturedAtIso);
}
