/**
 * Verrou distribué léger pour les crons in-process (campaign-automation, gbp-sync,
 * campaign-event-jobs). Stocké dans SQLite : si tu passes à 2 instances Railway,
 * un seul process exécutera le cron à un instant T (évite doublons d'envoi).
 *
 * Pas besoin de Redis pour cette version : SQLite suffit avec un INSERT OR IGNORE
 * atomique sur une clé + TTL. Si tu ajoutes Redis plus tard, garde la même API.
 *
 * USAGE :
 *   import { withCronLock } from "../lib/cron-lock.js";
 *   await withCronLock("campaign-automation", 60_000, async () => { ... });
 *
 * Si un autre process tient le verrou (TTL non expiré), l'appel retourne `false`
 * et le bloc n'est PAS exécuté. Sinon, exécute le bloc avec rafraîchissement
 * périodique du TTL (heartbeat) et le libère à la fin (success ou erreur).
 */
import { getDb } from "../db/connection.js";
import { randomUUID } from "crypto";
import logger from "./logger.js";

const db = getDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS cron_locks (
    name TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL
  );
`);

/**
 * Tente d'acquérir un verrou pour `name`. Si un autre owner détient le verrou
 * et que son `expires_at` n'est pas dépassé, échoue. Sinon, prend le verrou.
 * @returns {string|null} ownerId si acquis, null sinon.
 */
function tryAcquireLock(name, ttlMs) {
  const owner = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  // INSERT OR REPLACE n'est pas atomique ici (on perdrait le test sur expires_at).
  // Astuce : INSERT OR IGNORE puis UPDATE conditionnel — 2 statements mais atomic via transaction.
  const acquire = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO cron_locks (name, owner, acquired_at, expires_at, heartbeat_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, owner, now, expiresAt, now);
    // Si quelqu'un détient le lock mais que son TTL est dépassé → on le prend
    const upd = db.prepare(`
      UPDATE cron_locks
      SET owner = ?, acquired_at = ?, expires_at = ?, heartbeat_at = ?
      WHERE name = ? AND expires_at < ?
    `).run(owner, now, expiresAt, now, name, now);
    // Vérifie qui détient maintenant
    const row = db.prepare(`SELECT owner FROM cron_locks WHERE name = ?`).get(name);
    return row?.owner === owner;
  });
  const acquired = acquire();
  return acquired ? owner : null;
}

function refreshLock(name, owner, ttlMs) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const r = db.prepare(`
    UPDATE cron_locks SET heartbeat_at = ?, expires_at = ?
    WHERE name = ? AND owner = ?
  `).run(now, expiresAt, name, owner);
  return r.changes === 1;
}

function releaseLock(name, owner) {
  try {
    db.prepare(`DELETE FROM cron_locks WHERE name = ? AND owner = ?`).run(name, owner);
  } catch (_) {}
}

/**
 * Exécute `work` uniquement si on obtient le verrou `name`.
 * Heartbeat tous les 1/3 de TTL pour éviter qu'un autre process pense que le lock est expiré.
 *
 * @template T
 * @param {string} name - nom du verrou (ex. "campaign-automation")
 * @param {number} ttlMs - TTL initial (recommandé : 3-5× la durée estimée du cron)
 * @param {() => Promise<T>} work
 * @returns {Promise<T | "skipped">}
 */
export async function withCronLock(name, ttlMs, work) {
  const owner = tryAcquireLock(name, ttlMs);
  if (!owner) {
    logger.debug({ name }, "[cron-lock] skip — autre instance détient le verrou");
    return "skipped";
  }
  const heartbeatInterval = setInterval(() => {
    if (!refreshLock(name, owner, ttlMs)) {
      logger.warn({ name, owner }, "[cron-lock] heartbeat perdu (lock pris par un autre process)");
    }
  }, Math.max(5_000, Math.floor(ttlMs / 3)));
  try {
    return await work();
  } finally {
    clearInterval(heartbeatInterval);
    releaseLock(name, owner);
  }
}

/** Nettoyage périodique des locks orphelins (process killé sans cleanup). */
export function cleanExpiredCronLocks() {
  try {
    const now = new Date().toISOString();
    const r = db.prepare(`DELETE FROM cron_locks WHERE expires_at < ?`).run(now);
    if (r.changes > 0) {
      logger.debug({ deleted: r.changes }, "[cron-lock] locks expirés nettoyés");
    }
  } catch (_) {}
}
