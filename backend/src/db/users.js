/**
 * Repository users et password_reset_tokens. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

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
