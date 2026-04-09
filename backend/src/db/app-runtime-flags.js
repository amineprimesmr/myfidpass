/**
 * Drapeaux persistants (bootstrap admin, etc.).
 */
import { getDb } from "./connection.js";

const db = getDb();

export function getRuntimeFlag(key) {
  if (!key) return null;
  const row = db.prepare("SELECT value FROM app_runtime_flags WHERE key = ?").get(String(key));
  return row?.value != null ? String(row.value) : null;
}

export function setRuntimeFlag(key, value) {
  if (!key) return;
  db.prepare("INSERT OR REPLACE INTO app_runtime_flags (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
    String(key),
    String(value ?? ""),
  );
}
