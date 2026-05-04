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

/** Connexion / inscription par numéro (E.164). */
export function getUserByPhoneE164(phoneE164) {
  const norm = String(phoneE164 ?? "").trim();
  if (!norm) return null;
  const row = db.prepare("SELECT * FROM users WHERE phone_e164 = ?").get(norm);
  return row || null;
}

/** Domaine réservé pour l’e-mail technique des comptes employés (identifiant sans e-mail). */
const STAFF_EMAIL_DOMAIN = "@staff.myfidpass.internal";

/**
 * Normalise un identifiant employé : 3-32 caractères, a-z, 0-9, _ et - (ne commence/finit pas par un tiret seul bord à respecter : lettre ou chiffre aux extrémités).
 * @returns {string | null}
 */
export function normalizeStaffLogin(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/.test(s)) return null;
  return s;
}

export function isReservedStaffEmailOnly(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase()
    .endsWith(STAFF_EMAIL_DOMAIN);
}

export function getUserByStaffLogin(staffLoginNorm) {
  if (!staffLoginNorm) return null;
  const n = String(staffLoginNorm).trim().toLowerCase();
  const row = db
    .prepare("SELECT * FROM users WHERE lower(staff_login) = ? ORDER BY datetime(created_at) DESC")
    .get(n);
  return row || null;
}

/**
 * Plusieurs comptes employés peuvent partager le même identifiant (`staff_login`) sur des commerces différents.
 * Le login départage ensuite via le mot de passe.
 */
export function getUsersByStaffLogin(staffLoginNorm) {
  if (!staffLoginNorm) return [];
  const n = String(staffLoginNorm).trim().toLowerCase();
  return db
    .prepare("SELECT * FROM users WHERE lower(staff_login) = ? ORDER BY datetime(created_at) DESC")
    .all(n);
}

/**
 * Compte commerçant employé : se connecte avec identifiant + mot de passe, sans e-mail réel.
 * E-mail en base = `${staff_login}${STAFF_EMAIL_DOMAIN}` (réservé, non recevable).
 */
export function createStaffUser({ staffLogin, passwordHash, name, businessId }) {
  const norm = normalizeStaffLogin(staffLogin);
  if (!norm) {
    const err = new Error("STAFF_LOGIN_INVALID");
    err.code = "STAFF_LOGIN_INVALID";
    throw err;
  }
  const id = randomUUID();
  const bizToken = String(businessId || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  // E-mail technique UNIQUE même si deux commerces utilisent le même `staff_login`.
  const email = `${norm}+${bizToken || "global"}+${id.slice(0, 8)}${STAFF_EMAIL_DOMAIN}`;
  db.prepare("INSERT INTO users (id, email, password_hash, name, staff_login) VALUES (?, ?, ?, ?, ?)").run(
    id,
    email,
    passwordHash,
    name || null,
    norm,
  );
  return getUserById(id);
}

/**
 * Compte créé uniquement avec le téléphone : e-mail technique unique, mot de passe aléatoire (non utilisé).
 */
export function createUserWithPhone({ phoneE164, name }) {
  const id = randomUUID();
  const emailLocal = `${String(phoneE164).replace(/^\+/, "")}@phone.myfidpass.internal`;
  const randomPwd = randomUUID() + randomUUID();
  const passwordHash = bcrypt.hashSync(randomPwd, 10);
  db.prepare("INSERT INTO users (id, email, password_hash, name, phone_e164) VALUES (?, ?, ?, ?, ?)").run(
    id,
    emailLocal,
    passwordHash,
    name || null,
    phoneE164,
  );
  return getUserById(id);
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

export function getUserByAppleSub(sub) {
  const s = String(sub ?? "").trim();
  if (!s) return null;
  return db.prepare("SELECT * FROM users WHERE apple_sub = ?").get(s) || null;
}

export function setUserAppleSub(userId, sub) {
  const s = String(sub ?? "").trim();
  if (!userId || !s) return;
  try {
    db.prepare("UPDATE users SET apple_sub = ? WHERE id = ? AND apple_sub IS NULL").run(s, userId);
  } catch { /* ignore duplicate sub conflict */ }
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
 * Si `ADMIN_INITIAL_PASSWORD` est défini :
 * - **crée** les comptes manquants pour chaque email de `ADMIN_EMAILS` (mot de passe + `is_admin`),
 * - met à jour le mot de passe des comptes déjà existants.
 * **Une seule fois** (drapeau en base), sauf si `ADMIN_INITIAL_PASSWORD_FORCE=true`.
 * Retirer `ADMIN_INITIAL_PASSWORD` de Railway après la première connexion réussie.
 * @returns {{ accountsCreated: number, passwordsUpdated: number, skippedAlreadyDone: boolean }}
 */
export function applyAdminInitialPasswordFromEnv() {
  const pwd = (process.env.ADMIN_INITIAL_PASSWORD || "").trim();
  if (!pwd) return { accountsCreated: 0, passwordsUpdated: 0, skippedAlreadyDone: false };

  const forceRaw = String(process.env.ADMIN_INITIAL_PASSWORD_FORCE || "")
    .trim()
    .toLowerCase();
  const force = forceRaw === "1" || forceRaw === "true" || forceRaw === "yes";

  if (!force && getRuntimeFlag(ADMIN_INITIAL_PASSWORD_FLAG)) {
    return { accountsCreated: 0, passwordsUpdated: 0, skippedAlreadyDone: true };
  }

  const raw = (process.env.ADMIN_EMAILS || "").trim();
  if (!raw) return { accountsCreated: 0, passwordsUpdated: 0, skippedAlreadyDone: false };

  const emails = [...new Set(raw.split(",").map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  let accountsCreated = 0;
  let passwordsUpdated = 0;
  const passwordHash = bcrypt.hashSync(pwd, ADMIN_PASSWORD_SALT_ROUNDS);

  for (const email of emails) {
    let u = getUserByEmail(email);
    if (!u) {
      try {
        u = createUser({
          email,
          passwordHash,
          name: "Administrateur",
        });
        db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(u.id);
        accountsCreated++;
      } catch (err) {
        console.error("[admin] création compte bootstrap échouée:", email, err?.message || err);
      }
      continue;
    }
    if (!isUserAdmin(u)) {
      db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(u.id);
    }
    if (updateUserPassword(u.id, passwordHash)) passwordsUpdated++;
  }

  if (accountsCreated > 0 || passwordsUpdated > 0) {
    setRuntimeFlag(ADMIN_INITIAL_PASSWORD_FLAG, new Date().toISOString());
  }

  return { accountsCreated, passwordsUpdated, skippedAlreadyDone: false };
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
        `SELECT id, email, name, created_at, is_admin, staff_login FROM users
         WHERE lower(email) LIKE ? OR lower(COALESCE(name,'')) LIKE ? OR lower(COALESCE(staff_login,'')) LIKE ?
         ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, like, limit, offset);
  }
  return db
    .prepare(
      `SELECT id, email, name, created_at, is_admin, staff_login FROM users ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
}
