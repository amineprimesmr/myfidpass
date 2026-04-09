/**
 * Repository users et password_reset_tokens. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "./connection.js";
import { getRuntimeFlag, setRuntimeFlag } from "./app-runtime-flags.js";

const db = getDb();

export function createUser({ id: uid, email, passwordHash, name }) {
  const id = uid || randomUUID();
  db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)").run(id, email, passwordHash, name || null);
  return getUserById(id);
}

export function getUserByEmail(email) {
  const norm = String(email ?? "").trim().toLowerCase();
  if (!norm) return null;
  /* Comparaison insensible à la casse : comptes créés avant normalisation stricte ou imports. */
  const row = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(norm);
  return row || null;
}

export function getUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row || null;
}

export function updateUserPassword(userId, passwordHash) {
  if (!userId || !passwordHash) return false;
  const info = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  return info.changes > 0;
}

export function setPasswordResetToken(userId, token, expiresAt) {
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
}

export function getPasswordResetByToken(token) {
  if (!token) return null;
  const row = db.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > datetime('now')"
  ).get(token);
  return row || null;
}

export function deletePasswordResetToken(token) {
  if (!token) return;
  db.prepare("DELETE FROM password_reset_tokens WHERE token = ?").run(token);
}

/** Compte administrateur plateforme (support / pilotage tous les commerces). */
export function isUserAdmin(user) {
  if (!user) return false;
  const v = user.is_admin;
  return v === 1 || v === true || v === "1";
}

/**
 * Synchronise le flag admin depuis `ADMIN_EMAILS` (emails séparés par des virgules).
 * N’enlève jamais le statut admin (retrait manuel en base uniquement).
 * @returns {{ applied: number, skipped: number }}
 */
export function syncAdminEmailsFromEnv() {
  const raw = (process.env.ADMIN_EMAILS || "").trim();
  if (!raw) return { applied: 0, skipped: 0 };
  const emails = [...new Set(raw.split(",").map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  let applied = 0;
  let skipped = 0;
  for (const email of emails) {
    const u = getUserByEmail(email);
    if (!u) {
      skipped++;
      continue;
    }
    if (isUserAdmin(u)) continue;
    db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(u.id);
    applied++;
  }
  return { applied, skipped };
}

const ADMIN_INITIAL_PASSWORD_FLAG = "admin_initial_password_done";
const ADMIN_PASSWORD_SALT_ROUNDS = 10;

/**
 * Si `ADMIN_INITIAL_PASSWORD` est défini : définit le mot de passe (bcrypt) pour chaque email listé dans `ADMIN_EMAILS`
 * qui existe déjà en base. **Une seule fois** (drapeau en base), sauf si `ADMIN_INITIAL_PASSWORD_FORCE=true`.
 * À utiliser pour le premier setup prod sans CLI ; retirer la variable secrète juste après succès.
 * @returns {{ applied: number, skipped: number, skippedAlreadyDone: boolean }}
 */
export function applyAdminInitialPasswordFromEnv() {
  const pwd = (process.env.ADMIN_INITIAL_PASSWORD || "").trim();
  if (!pwd) return { applied: 0, skipped: 0, skippedAlreadyDone: false };

  const forceRaw = String(process.env.ADMIN_INITIAL_PASSWORD_FORCE || "")
    .trim()
    .toLowerCase();
  const force = forceRaw === "1" || forceRaw === "true" || forceRaw === "yes";

  if (!force && getRuntimeFlag(ADMIN_INITIAL_PASSWORD_FLAG)) {
    return { applied: 0, skipped: 0, skippedAlreadyDone: true };
  }

  const raw = (process.env.ADMIN_EMAILS || "").trim();
  if (!raw) return { applied: 0, skipped: 0, skippedAlreadyDone: false };

  const emails = [...new Set(raw.split(",").map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  let applied = 0;
  let skipped = 0;
  const passwordHash = bcrypt.hashSync(pwd, ADMIN_PASSWORD_SALT_ROUNDS);

  for (const email of emails) {
    const u = getUserByEmail(email);
    if (!u) {
      skipped++;
      continue;
    }
    if (updateUserPassword(u.id, passwordHash)) applied++;
  }

  if (applied > 0) {
    setRuntimeFlag(ADMIN_INITIAL_PASSWORD_FLAG, new Date().toISOString());
  }

  return { applied, skipped, skippedAlreadyDone: false };
}

/**
 * Liste paginée pour le dashboard admin (recherche email / nom).
 * @param {{ limit?: number, offset?: number, q?: string }} p
 */
export function listUsersForAdmin(p = {}) {
  const limit = Math.min(Math.max(1, Number(p.limit) || 50), 200);
  const offset = Math.max(0, Number(p.offset) || 0);
  const q = String(p.q ?? "")
    .trim()
    .toLowerCase()
    .replace(/%/g, "");
  if (q) {
    const like = `%${q}%`;
    return db
      .prepare(
        `SELECT id, email, name, created_at, is_admin FROM users
         WHERE lower(email) LIKE ? OR lower(COALESCE(name,'')) LIKE ?
         ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, limit, offset);
  }
  return db
    .prepare(
      `SELECT id, email, name, created_at, is_admin FROM users ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
}
