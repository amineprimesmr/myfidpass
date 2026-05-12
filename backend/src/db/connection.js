/**
 * Connexion SQLite et initialisation (schema + migrations). Référence : REFONTE-REGLES.md.
 *
 * Tuning appliqué au boot (gain mesurable 3-5× sur lectures concurrentes) :
 *   - journal_mode = WAL          → readers concurrents avec un seul writer
 *   - synchronous = NORMAL        → safe avec WAL, ~2× plus rapide que FULL
 *   - busy_timeout = 5000         → évite SQLITE_BUSY sur contention courte
 *   - foreign_keys = ON           → cohérence référentielle (default OFF en SQLite !)
 *   - temp_store = MEMORY         → tris/jointures en RAM
 *   - mmap_size = 256 MB          → I/O memory-mapped pour les lectures fréquentes
 *   - cache_size = -20000         → 20 MB de cache pages (négatif = KB)
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { runSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(__dirname, "..", "..", "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "fidelity.db");

export const DATA_DIR_PATH = dataDir;
export const DB_FILE_PATH = dbPath;

const db = new Database(dbPath);

// ── Tuning SQLite (appliquer AVANT schema/migrations) ────────────────────────
// Ces pragmas se posent une fois par connexion. better-sqlite3 ouvre une seule
// connexion par process, donc ces appels suffisent pour toute la durée de vie.
try {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256 MB
  db.pragma("cache_size = -20000"); // 20 MB
} catch (e) {
  // Ne JAMAIS planter le boot pour un pragma — log seulement.
  // eslint-disable-next-line no-console
  console.warn("[db/connection] pragma tuning partiel:", e?.message || e);
}

runSchema(db);
runMigrations(db);

/**
 * Checkpoint manuel WAL (à appeler depuis un cron léger ou au shutdown gracieux).
 * Évite que le fichier `-wal` grandisse indéfiniment si le serveur ne s'arrête
 * jamais "proprement" (Railway redéploiements).
 */
export function checkpointWAL() {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (_) {}
}

export function getDb() {
  return db;
}

export default db;
