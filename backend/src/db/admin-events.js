/**
 * Journal interne pour les administrateurs (paiements, actions sensibles).
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

/**
 * @param {{ eventType: string, payloadJson: string | object, stripeEventId?: string|null }} p
 */
export function insertAdminEvent(p) {
  const id = randomUUID();
  const payload =
    typeof p.payloadJson === "string" ? p.payloadJson : JSON.stringify(p.payloadJson ?? {});
  db.prepare(
    `INSERT INTO admin_events (id, event_type, payload_json, stripe_event_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(id, p.eventType, payload, p.stripeEventId || null);
  return id;
}

export function listAdminEvents(limit = 100) {
  const lim = Math.min(Math.max(1, limit), 500);
  return db
    .prepare(
      `SELECT id, event_type, payload_json, stripe_event_id, created_at FROM admin_events ORDER BY datetime(created_at) DESC LIMIT ?`,
    )
    .all(lim);
}
