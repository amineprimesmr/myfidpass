/**
 * Connexion SQLite et initialisation (schema + migrations). Référence : REFONTE-REGLES.md.
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
runSchema(db);
runMigrations(db);

export function getDb() {
  return db;
}

export default db;
