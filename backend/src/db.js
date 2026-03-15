import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR permet de pointer vers un volume persistant (ex. Railway: DATA_DIR=/data)
const dataDir = process.env.DATA_DIR || join(__dirname, "..", "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "fidelity.db");

/** Exposé pour diagnostic (vérifier que la base est bien sur le volume). */
export const DATA_DIR_PATH = dataDir;
export const DB_FILE_PATH = dbPath;

const db = new Database(dbPath);

// Tables : businesses (entreprises / tenants), members (clients finaux)
db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    organization_name TEXT NOT NULL,
    back_terms TEXT,
    back_contact TEXT,
    background_color TEXT,
    foreground_color TEXT,
    label_color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    business_id TEXT,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    type TEXT NOT NULL,
    points INTEGER NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
  CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
  CREATE INDEX IF NOT EXISTS idx_members_business_id ON members(business_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_business ON transactions(business_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_id TEXT NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'active',
    current_period_end TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS pass_registrations (
    device_library_identifier TEXT NOT NULL,
    pass_type_identifier TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    push_token TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (device_library_identifier, pass_type_identifier, serial_number)
  );
  CREATE INDEX IF NOT EXISTS idx_pass_reg_serial ON pass_registrations(serial_number);

  CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );
  CREATE INDEX IF NOT EXISTS idx_web_push_business ON web_push_subscriptions(business_id);
  CREATE INDEX IF NOT EXISTS idx_web_push_member ON web_push_subscriptions(member_id);

  CREATE TABLE IF NOT EXISTS notification_log (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    member_id TEXT,
    title TEXT,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'web_push',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );
  CREATE INDEX IF NOT EXISTS idx_notification_log_business ON notification_log(business_id);

  CREATE TABLE IF NOT EXISTS merchant_device_tokens (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    device_token TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration : ajouter business_id si ancienne base
const hasBusinessId = db.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "business_id");
if (!hasBusinessId) {
  db.exec("ALTER TABLE members ADD COLUMN business_id TEXT");
}
// Migration : couleurs personnalisées sur businesses
const bizCols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
for (const col of ["background_color", "foreground_color", "label_color", "points_per_euro", "points_per_visit", "dashboard_token", "logo_base64", "logo_updated_at"]) {
  if (!bizCols.includes(col)) {
    db.exec(`ALTER TABLE businesses ADD COLUMN ${col} TEXT`);
  }
}
// points_per_euro / points_per_visit : numériques stockés en TEXT pour simplicité migration
const bizCols2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (bizCols2.includes("points_per_euro")) {
  try {
    db.exec(`UPDATE businesses SET points_per_euro = '1' WHERE points_per_euro IS NULL`);
  } catch (_) {}
}
if (bizCols2.includes("points_per_visit")) {
  try {
    db.exec(`UPDATE businesses SET points_per_visit = '1' WHERE points_per_visit IS NULL`);
  } catch (_) {}
}
// Migration : last_visit_at sur members
const memCols = db.prepare("PRAGMA table_info(members)").all().map((c) => c.name);
if (!memCols.includes("last_visit_at")) {
  db.exec("ALTER TABLE members ADD COLUMN last_visit_at TEXT");
}
// Migration : localisation Apple Wallet sur businesses (affichage pass à l'écran de verrouillage)
const bizColsLoc = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
for (const col of ["location_lat", "location_lng", "location_relevant_text", "location_radius_meters", "location_address"]) {
  if (!bizColsLoc.includes(col)) {
    const type = col === "location_radius_meters" ? "INTEGER" : col === "location_relevant_text" || col === "location_address" ? "TEXT" : "REAL";
    db.exec(`ALTER TABLE businesses ADD COLUMN ${col} ${type}`);
  }
}
// Migration : user_id sur businesses (propriétaire du commerce)
const bizColsUser = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsUser.includes("user_id")) {
  db.exec("ALTER TABLE businesses ADD COLUMN user_id TEXT REFERENCES users(id)");
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id)");
  } catch (_) {}
}
// Migration : required_stamps (nombre de tampons pour carte type tampons — app / SaaS)
const bizColsStamps = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsStamps.includes("required_stamps")) {
  db.exec("ALTER TABLE businesses ADD COLUMN required_stamps INTEGER");
}
// Migration : stamp_emoji (emoji affiché à côté des points/tampons sur le pass — ex. ☕ 🍔 ⭐)
const bizColsAfter = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsAfter.includes("stamp_emoji")) {
  db.exec("ALTER TABLE businesses ADD COLUMN stamp_emoji TEXT");
}
// Migration : stamp_icon_base64 (icône personnalisée pour tampons, remplace l'emoji)
if (!bizColsAfter.includes("stamp_icon_base64")) {
  db.exec("ALTER TABLE businesses ADD COLUMN stamp_icon_base64 TEXT");
}
// Migration : stamp_icon_base64 (icône personnalisée pour tampons, image uploadée par le commerçant)
if (!bizColsAfter.includes("stamp_icon_base64")) {
  db.exec("ALTER TABLE businesses ADD COLUMN stamp_icon_base64 TEXT");
}
// Migration : image de fond de carte (strip personnalisé pour le pass Wallet)
const bizColsBg = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsBg.includes("card_background_base64")) {
  db.exec("ALTER TABLE businesses ADD COLUMN card_background_base64 TEXT");
}
const bizColsStrip = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsStrip.includes("strip_color")) {
  db.exec("ALTER TABLE businesses ADD COLUMN strip_color TEXT");
}
if (!bizColsStrip.includes("strip_display_mode")) {
  db.exec("ALTER TABLE businesses ADD COLUMN strip_display_mode TEXT DEFAULT 'logo'");
}
if (!bizColsStrip.includes("strip_text")) {
  db.exec("ALTER TABLE businesses ADD COLUMN strip_text TEXT");
}
// Migration : règles de la carte (type programme, récompenses, seuils)
const bizColsRules = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
for (const { col, type } of [
  { col: "program_type", type: "TEXT" },
  { col: "label_restants", type: "TEXT" },
  { col: "label_member", type: "TEXT" },
  { col: "header_right_text", type: "TEXT" },
  { col: "stamp_reward_label", type: "TEXT" },
  { col: "points_min_amount_eur", type: "REAL" },
  { col: "points_reward_tiers", type: "TEXT" },
  { col: "loyalty_mode", type: "TEXT" },
  { col: "points_per_ticket", type: "INTEGER" },
  { col: "expiry_months", type: "INTEGER" },
  { col: "sector", type: "TEXT" },
]) {
  if (!bizColsRules.includes(col)) {
    db.exec(`ALTER TABLE businesses ADD COLUMN ${col} ${type}`);
  }
}
try {
  db.exec("UPDATE businesses SET loyalty_mode = 'points_cash' WHERE loyalty_mode IS NULL OR TRIM(loyalty_mode) = ''");
  db.exec("UPDATE businesses SET points_per_ticket = 10 WHERE points_per_ticket IS NULL OR points_per_ticket <= 0");
} catch (_) {}
// Garantir que la business "demo" existe (migration, avant que getBusinessBySlug soit défini)
function ensureDemoBusiness() {
  let b = db.prepare("SELECT * FROM businesses WHERE slug = ?").get("demo");
  if (!b) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "Demo Fast-Food",
      "demo",
      "Demo Fast-Food",
      "1 point = 1 € de réduction. Valable en magasin.",
      "contact@example.com"
    );
    b = db.prepare("SELECT * FROM businesses WHERE slug = ?").get("demo");
  }
  return b;
}
const defaultBiz = ensureDemoBusiness();
db.prepare("UPDATE members SET business_id = ? WHERE business_id IS NULL").run(defaultBiz.id);
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_members_business ON members(business_id)");
} catch (_) {
  // Index existe déjà
}
// Migration : table password_reset_tokens (mot de passe oublié)
try {
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'"
  ).get();
  if (!tableExists) {
    db.exec(`
      CREATE TABLE password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
      CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at);
    `);
  }
} catch (_) {}

// Migration : Avis & Réseaux (récompenses Google avis, Instagram, TikTok, etc.)
const bizColsEng = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsEng.includes("engagement_rewards")) {
  db.exec("ALTER TABLE businesses ADD COLUMN engagement_rewards TEXT");
}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engagement_completions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      points_granted INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
    CREATE INDEX IF NOT EXISTS idx_engagement_completions_business ON engagement_completions(business_id);
    CREATE INDEX IF NOT EXISTS idx_engagement_completions_member ON engagement_completions(member_id);
    CREATE INDEX IF NOT EXISTS idx_engagement_completions_created ON engagement_completions(created_at);
  `);
} catch (_) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'roulette',
      active INTEGER NOT NULL DEFAULT 1,
      config_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_games (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      ticket_cost INTEGER NOT NULL DEFAULT 1,
      daily_spin_limit INTEGER NOT NULL DEFAULT 20,
      cooldown_seconds INTEGER NOT NULL DEFAULT 10,
      weight_profile_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (game_id) REFERENCES games(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_business_games_unique ON business_games(business_id, game_id);
    CREATE INDEX IF NOT EXISTS idx_business_games_business ON business_games(business_id);

    CREATE TABLE IF NOT EXISTS member_ticket_wallets (
      member_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      ticket_balance INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_ticket_wallets_business ON member_ticket_wallets(business_id);

    CREATE TABLE IF NOT EXISTS ticket_ledger (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      idempotency_key TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_ledger_business_member_created ON ticket_ledger(business_id, member_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_ledger_business_idempotency ON ticket_ledger(business_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS game_rewards (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'none',
      value_json TEXT,
      stock INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      weight REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (game_id) REFERENCES games(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_game_rewards_unique ON game_rewards(business_id, game_id, code);
    CREATE INDEX IF NOT EXISTS idx_game_rewards_business_game ON game_rewards(business_id, game_id);

    CREATE TABLE IF NOT EXISTS game_spins (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      ticket_cost INTEGER NOT NULL DEFAULT 1,
      rng_seed_hash TEXT,
      outcome_code TEXT,
      reward_id TEXT,
      idempotency_key TEXT,
      risk_score REAL NOT NULL DEFAULT 0,
      client_ip_hash TEXT,
      device_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (reward_id) REFERENCES game_rewards(id)
    );
    CREATE INDEX IF NOT EXISTS idx_game_spins_business_member_created ON game_spins(business_id, member_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_game_spins_business_idempotency ON game_spins(business_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS reward_grants (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      spin_id TEXT NOT NULL UNIQUE,
      reward_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'granted',
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT,
      expires_at TEXT,
      metadata_json TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (spin_id) REFERENCES game_spins(id),
      FOREIGN KEY (reward_id) REFERENCES game_rewards(id)
    );
    CREATE INDEX IF NOT EXISTS idx_reward_grants_business_member_created ON reward_grants(business_id, member_id, granted_at DESC);
  `);
} catch (_) {}
try {
  const roulette = db.prepare("SELECT id FROM games WHERE code = ?").get("roulette");
  if (!roulette) {
    const gameId = randomUUID();
    db.prepare(
      "INSERT INTO games (id, code, name, type, active, config_json, created_at) VALUES (?, 'roulette', 'Roulette FidPass', 'roulette', 1, ?, datetime('now'))"
    ).run(gameId, JSON.stringify({ display_name: "Roulette", min_client_version: 1 }));
  }
} catch (_) {}
try {
  const cols = db.prepare("PRAGMA table_info(engagement_completions)").all().map((c) => c.name);
  if (!cols.includes("proof_id")) db.exec("ALTER TABLE engagement_completions ADD COLUMN proof_id TEXT");
  if (!cols.includes("proof_score")) db.exec("ALTER TABLE engagement_completions ADD COLUMN proof_score REAL");
} catch (_) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engagement_proofs (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      nonce TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      score REAL NOT NULL DEFAULT 0,
      reasons TEXT,
      start_ip_hash TEXT,
      return_ip_hash TEXT,
      claim_ip_hash TEXT,
      start_device_hash TEXT,
      claim_device_hash TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      returned_at TEXT,
      claimed_at TEXT,
      completion_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
    CREATE INDEX IF NOT EXISTS idx_engagement_proofs_business ON engagement_proofs(business_id);
    CREATE INDEX IF NOT EXISTS idx_engagement_proofs_member ON engagement_proofs(member_id);
    CREATE INDEX IF NOT EXISTS idx_engagement_proofs_action ON engagement_proofs(action_type);
    CREATE INDEX IF NOT EXISTS idx_engagement_proofs_created ON engagement_proofs(created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_engagement_proofs_token_hash ON engagement_proofs(token_hash);
  `);
} catch (_) {}

export function getBusinessBySlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  const row = db.prepare("SELECT * FROM businesses WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?))").get(slug);
  return row || null;
}

export function createUser({ id: uid, email, passwordHash, name }) {
  const id = uid || randomUUID();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"
  ).run(id, email, passwordHash, name || null);
  return getUserById(id);
}

export function getUserByEmail(email) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  return row || null;
}

export function getUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row || null;
}

/** Met à jour le mot de passe d’un utilisateur (réinitialisation). */
export function updateUserPassword(userId, passwordHash) {
  if (!userId || !passwordHash) return false;
  const info = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  return info.changes > 0;
}

/** Enregistre un token de réinitialisation (écrase un éventuel ancien pour ce user). */
export function setPasswordResetToken(userId, token, expiresAt) {
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare(
    "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, expiresAt);
}

/** Récupère l’entrée token si valide (non expiré). */
export function getPasswordResetByToken(token) {
  if (!token) return null;
  const row = db.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > datetime('now')"
  ).get(token);
  return row || null;
}

/** Supprime un token (après utilisation ou annulation). */
export function deletePasswordResetToken(token) {
  if (!token) return;
  db.prepare("DELETE FROM password_reset_tokens WHERE token = ?").run(token);
}

export function getBusinessesByUserId(userId) {
  return db.prepare(
    "SELECT id, name, slug, organization_name, created_at, dashboard_token FROM businesses WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId);
}

export function getBusinessById(id) {
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  return row || null;
}

function generateToken() {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
}

export function createBusiness({
  id,
  name,
  slug,
  organizationName,
  backTerms,
  backContact,
  backgroundColor,
  foregroundColor,
  labelColor,
  pointsPerEuro,
  pointsPerVisit,
  dashboardToken,
  userId,
}) {
  const bid = id || randomUUID();
  const token = dashboardToken || generateToken();
  const perEuro = pointsPerEuro != null ? String(pointsPerEuro) : "1";
  const perVisit = pointsPerVisit != null ? String(pointsPerVisit) : "1";
  db.prepare(
    `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact, background_color, foreground_color, label_color, points_per_euro, points_per_visit, dashboard_token, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bid,
    name,
    slug,
    organizationName || name,
    backTerms || null,
    backContact || null,
    backgroundColor || null,
    foregroundColor || null,
    labelColor || null,
    perEuro,
    perVisit,
    token,
    userId || null
  );
  return getBusinessById(bid);
}

export function updateBusiness(businessId, updates) {
  const b = getBusinessById(businessId);
  if (!b) return null;
  const allowed = [
    "slug",
    "organization_name",
    "back_terms",
    "back_contact",
    "background_color",
    "foreground_color",
    "label_color",
    "logo_base64",
    "logo_updated_at",
    "card_background_base64",
    "strip_color",
    "strip_display_mode",
    "strip_text",
    "location_lat",
    "location_lng",
    "location_relevant_text",
    "location_radius_meters",
    "location_address",
    "required_stamps",
    "stamp_emoji",
    "points_per_euro",
    "points_per_visit",
    "program_type",
    "loyalty_mode",
    "points_per_ticket",
    "stamp_reward_label",
    "points_min_amount_eur",
    "points_reward_tiers",
    "expiry_months",
    "sector",
    "engagement_rewards",
  ];
  const numericCols = ["location_lat", "location_lng", "location_radius_meters", "required_stamps", "points_min_amount_eur", "expiry_months", "points_per_ticket"];
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (allowed.includes(col) && value !== undefined) {
      setClauses.push(`${col} = ?`);
      if (col === "logo_base64" || col === "card_background_base64") {
        values.push(value === null || value === "" ? null : String(value));
      } else if (col === "points_reward_tiers" || col === "engagement_rewards") {
        values.push(value == null || value === "" ? null : (typeof value === "string" ? value : JSON.stringify(value)));
      } else if (numericCols.includes(col)) {
        const n = value === null || value === "" ? null : Number(value);
        values.push(Number.isFinite(n) ? n : null);
      } else {
        values.push(value === null || value === "" ? null : String(value).trim());
      }
    }
  }
  if (setClauses.length === 0) return b;
  if (updates.logo_base64 !== undefined) {
    setClauses.push("logo_updated_at = ?");
    values.push(new Date().toISOString());
  }
  values.push(businessId);
  db.prepare(`UPDATE businesses SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  return getBusinessById(businessId);
}

export function createMember({ id, businessId, email, name, points = 0 }) {
  const mid = id || randomUUID();
  const pts = Number.isFinite(Number(points)) && Number(points) >= 0 ? Number(points) : 0;
  db.prepare(
    "INSERT INTO members (id, business_id, email, name, points) VALUES (?, ?, ?, ?, ?)"
  ).run(mid, businessId, email, name, pts);
  return getMember(mid);
}

export function getMember(id) {
  const row = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
  return row || null;
}

export function getMemberForBusiness(memberId, businessId) {
  const row = db.prepare("SELECT * FROM members WHERE id = ? AND business_id = ?").get(memberId, businessId);
  return row || null;
}

/** Membre par email pour un commerce (import / doublons). */
export function getMemberByEmailForBusiness(businessId, email) {
  if (!businessId || !email) return null;
  const norm = String(email).trim().toLowerCase();
  if (!norm) return null;
  return db.prepare("SELECT * FROM members WHERE business_id = ? AND LOWER(TRIM(email)) = ?").get(businessId, norm) || null;
}

/** Met à jour nom et/ou points d'un membre (import doublon = update). */
export function updateMember(memberId, { name, points }) {
  const m = getMember(memberId);
  if (!m) return null;
  if (name !== undefined) db.prepare("UPDATE members SET name = ? WHERE id = ?").run(String(name).trim(), memberId);
  if (Number.isFinite(Number(points)) && Number(points) >= 0) db.prepare("UPDATE members SET points = ? WHERE id = ?").run(Number(points), memberId);
  return getMember(memberId);
}

export function addPoints(id, points) {
  const stmt = db.prepare("UPDATE members SET points = points + ?, last_visit_at = datetime('now') WHERE id = ?");
  stmt.run(points, id);
  return getMember(id);
}

/** Déduire des points (utilisation d'une récompense). Ne descend pas en dessous de 0. */
export function deductPoints(id, pointsToDeduct) {
  const amount = Math.max(0, Math.floor(Number(pointsToDeduct) || 0));
  if (amount <= 0) return getMember(id);
  db.prepare("UPDATE members SET points = MAX(0, points - ?), last_visit_at = datetime('now') WHERE id = ?").run(amount, id);
  return getMember(id);
}

/** Remet les points (tampons) à 0 — pour utilisation récompense type tampons. */
export function resetMemberPoints(id) {
  db.prepare("UPDATE members SET points = 0, last_visit_at = datetime('now') WHERE id = ?").run(id);
  return getMember(id);
}

/** Met à jour last_visit_at sans toucher aux points. Utilisé quand on envoie une notif depuis la section Notifications : comme pour l’ajout de points, le pass doit être « modifié » pour que l’iPhone refetch et affiche la notif. */
export function touchMemberLastVisit(memberId) {
  if (!memberId) return;
  db.prepare("UPDATE members SET last_visit_at = datetime('now') WHERE id = ?").run(memberId);
}

export function getBusinessByDashboardToken(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM businesses WHERE dashboard_token = ?").get(token);
  return row || null;
}

export function createTransaction({ id, businessId, memberId, type, points, metadata }) {
  const tid = id || randomUUID();
  db.prepare(
    `INSERT INTO transactions (id, business_id, member_id, type, points, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(tid, businessId, memberId, type, points, metadata ? JSON.stringify(metadata) : null);
  return db.prepare("SELECT * FROM transactions WHERE id = ?").get(tid);
}

function parseJsonSafe(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function getDefaultPointsPerTicket(business) {
  const n = Number(business?.points_per_ticket);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

function ensureMemberTicketWallet(businessId, memberId) {
  const existing = db
    .prepare("SELECT member_id, business_id, ticket_balance, updated_at FROM member_ticket_wallets WHERE member_id = ? AND business_id = ?")
    .get(memberId, businessId);
  if (existing) return existing;
  db.prepare(
    "INSERT OR IGNORE INTO member_ticket_wallets (member_id, business_id, ticket_balance, updated_at) VALUES (?, ?, 0, datetime('now'))"
  ).run(memberId, businessId);
  return db
    .prepare("SELECT member_id, business_id, ticket_balance, updated_at FROM member_ticket_wallets WHERE member_id = ? AND business_id = ?")
    .get(memberId, businessId);
}

/** Ajoute des tickets au membre pour une mission engagement (avis Google = 2, autres = 1). */
function addTicketsForEngagement(businessId, memberId, tickets, actionType, completionId) {
  if (!tickets || tickets < 1) return;
  const wallet = ensureMemberTicketWallet(businessId, memberId);
  const nextBalance = (Number(wallet?.ticket_balance) || 0) + tickets;
  db.prepare(
    "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
  ).run(nextBalance, memberId, businessId);
  db.prepare(
    `INSERT INTO ticket_ledger
     (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
     VALUES (?, ?, ?, 'engagement', ?, ?, 'engagement_completion', ?, NULL, ?, datetime('now'))`
  ).run(
    randomUUID(),
    businessId,
    memberId,
    tickets,
    nextBalance,
    completionId,
    JSON.stringify({ action_type: actionType })
  );
}

function getGameByCode(gameCode = "roulette") {
  return db.prepare("SELECT * FROM games WHERE code = ? AND active = 1").get(gameCode) || null;
}

function ensureBusinessGame(businessId, gameCode = "roulette") {
  const game = getGameByCode(gameCode);
  if (!game) return null;
  const existing = db
    .prepare(
      `SELECT bg.*, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.business_id = ? AND bg.game_id = ?`
    )
    .get(businessId, game.id);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO business_games
     (id, business_id, game_id, enabled, ticket_cost, daily_spin_limit, cooldown_seconds, weight_profile_json, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, 20, 10, ?, datetime('now'), datetime('now'))`
  ).run(id, businessId, game.id, JSON.stringify({ profile: "default" }));
  return db
    .prepare(
      `SELECT bg.*, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.id = ?`
    )
    .get(id);
}

function seedDefaultGameRewards(businessId, gameId) {
  const count = db
    .prepare("SELECT COUNT(*) as n FROM game_rewards WHERE business_id = ? AND game_id = ?")
    .get(businessId, gameId)?.n;
  if ((count || 0) > 0) return;
  const rows = [
    { code: "no_reward", label: "Pas de lot", kind: "none", weight: 65, value: null },
    { code: "small_points", label: "10 points bonus", kind: "points", weight: 25, value: { points: 10 } },
    { code: "medium_points", label: "25 points bonus", kind: "points", weight: 8, value: { points: 25 } },
    { code: "big_points", label: "50 points bonus", kind: "points", weight: 2, value: { points: 50 } },
  ];
  const stmt = db.prepare(
    `INSERT INTO game_rewards
     (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, datetime('now'))`
  );
  for (const row of rows) {
    stmt.run(
      randomUUID(),
      businessId,
      gameId,
      row.code,
      row.label,
      row.kind,
      row.value ? JSON.stringify(row.value) : null,
      row.weight
    );
  }
}

export function getBusinessGames(businessId) {
  const base = ensureBusinessGame(businessId, "roulette");
  if (base) seedDefaultGameRewards(businessId, base.game_id);
  const rows = db
    .prepare(
      `SELECT bg.id, bg.business_id, bg.enabled, bg.ticket_cost, bg.daily_spin_limit, bg.cooldown_seconds,
              bg.weight_profile_json, bg.updated_at,
              g.id as game_id, g.code as game_code, g.name as game_name, g.type as game_type
       FROM business_games bg
       JOIN games g ON g.id = bg.game_id
       WHERE bg.business_id = ?
       ORDER BY g.code ASC`
    )
    .all(businessId);
  return rows.map((row) => ({
    ...row,
    enabled: Number(row.enabled) === 1,
    ticket_cost: Number(row.ticket_cost) || 1,
    daily_spin_limit: Number(row.daily_spin_limit) || 0,
    cooldown_seconds: Number(row.cooldown_seconds) || 0,
    weight_profile: parseJsonSafe(row.weight_profile_json, { profile: "default" }) || { profile: "default" },
  }));
}

export function updateBusinessGameConfig(businessId, gameCode, updates = {}) {
  const bg = ensureBusinessGame(businessId, gameCode);
  if (!bg) return null;
  const allowed = ["enabled", "ticket_cost", "daily_spin_limit", "cooldown_seconds", "weight_profile_json"];
  const sets = [];
  const values = [];
  for (const [k, raw] of Object.entries(updates)) {
    if (!allowed.includes(k) || raw === undefined) continue;
    if (k === "enabled") {
      sets.push("enabled = ?");
      values.push(raw ? 1 : 0);
    } else if (k === "weight_profile_json") {
      sets.push("weight_profile_json = ?");
      values.push(raw == null ? null : (typeof raw === "string" ? raw : JSON.stringify(raw)));
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) continue;
      sets.push(`${k} = ?`);
      values.push(Math.floor(n));
    }
  }
  if (sets.length === 0) {
    return getBusinessGames(businessId).find((g) => g.game_code === gameCode) || null;
  }
  values.push(bg.id);
  db.prepare(`UPDATE business_games SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  return getBusinessGames(businessId).find((g) => g.game_code === gameCode) || null;
}

export function getGameRewardsForBusiness(businessId, gameCode = "roulette") {
  const bg = ensureBusinessGame(businessId, gameCode);
  if (!bg) return [];
  seedDefaultGameRewards(businessId, bg.game_id);
  const rows = db
    .prepare(
      `SELECT id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at
       FROM game_rewards
       WHERE business_id = ? AND game_id = ?
       ORDER BY weight DESC, created_at ASC`
    )
    .all(businessId, bg.game_id);
  return rows.map((row) => ({
    ...row,
    value: parseJsonSafe(row.value_json, null),
    active: Number(row.active) === 1,
    weight: Number(row.weight) || 0,
  }));
}

export function replaceGameRewardsForBusiness(businessId, gameCode = "roulette", rewards = []) {
  const bg = ensureBusinessGame(businessId, gameCode);
  if (!bg) return [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM game_rewards WHERE business_id = ? AND game_id = ?").run(businessId, bg.game_id);
    const insert = db.prepare(
      `INSERT INTO game_rewards
       (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    for (const reward of rewards) {
      const id = randomUUID();
      const code = String(reward.code || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 40);
      if (!code) continue;
      const label = String(reward.label || code).trim().slice(0, 120);
      const kind = ["none", "points", "discount", "free_item"].includes(reward.kind) ? reward.kind : "none";
      const weight = Math.max(0, Number(reward.weight) || 0);
      const stock = reward.stock == null ? null : Math.max(0, Number(reward.stock) || 0);
      const active = reward.active === false ? 0 : 1;
      insert.run(
        id,
        businessId,
        bg.game_id,
        code,
        label,
        kind,
        reward.value == null ? null : JSON.stringify(reward.value),
        stock,
        active,
        weight
      );
    }
  });
  tx();
  const fresh = getGameRewardsForBusiness(businessId, gameCode);
  if (fresh.length === 0) {
    seedDefaultGameRewards(businessId, bg.game_id);
    return getGameRewardsForBusiness(businessId, gameCode);
  }
  return fresh;
}

export function getMemberTicketWallet(businessId, memberId) {
  return ensureMemberTicketWallet(businessId, memberId);
}

export function getMemberTicketHistory(businessId, memberId, limit = 30) {
  return db
    .prepare(
      `SELECT id, source_type, delta, balance_after, reference_type, reference_id, metadata_json, created_at
       FROM ticket_ledger
       WHERE business_id = ? AND member_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(businessId, memberId, Math.max(1, Math.min(100, Number(limit) || 30)))
    .map((row) => ({ ...row, metadata: parseJsonSafe(row.metadata_json, null) }));
}

export function convertPointsToTickets({
  businessId,
  memberId,
  pointsToConvert,
  idempotencyKey = null,
  metadata = null,
}) {
  const business = getBusinessById(businessId);
  if (!business) return { error: "business_not_found" };
  if ((business.loyalty_mode || "points_cash") !== "points_game_tickets") {
    return { error: "mode_disabled" };
  }
  const pts = Math.floor(Number(pointsToConvert) || 0);
  const pointsPerTicket = getDefaultPointsPerTicket(business);
  if (pts <= 0 || pts < pointsPerTicket) return { error: "invalid_points" };
  const tx = db.transaction(() => {
    if (idempotencyKey) {
      const existingLedger = db
        .prepare("SELECT * FROM ticket_ledger WHERE business_id = ? AND idempotency_key = ? LIMIT 1")
        .get(businessId, idempotencyKey);
      if (existingLedger) {
        const wallet = ensureMemberTicketWallet(businessId, memberId);
        const member = getMember(memberId);
        return { ok: true, idempotent: true, wallet, member, converted_points: 0, tickets_added: 0 };
      }
    }
    const member = getMemberForBusiness(memberId, businessId);
    if (!member) return { error: "member_not_found" };
    if ((Number(member.points) || 0) < pts) return { error: "not_enough_points" };
    const tickets = Math.floor(pts / pointsPerTicket);
    const pointsUsed = tickets * pointsPerTicket;
    if (tickets <= 0 || pointsUsed <= 0) return { error: "invalid_points" };

    const wallet = ensureMemberTicketWallet(businessId, memberId);
    const nextBalance = (Number(wallet?.ticket_balance) || 0) + tickets;
    db.prepare(
      "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
    ).run(nextBalance, memberId, businessId);
    db.prepare(
      "UPDATE members SET points = points - ?, last_visit_at = datetime('now') WHERE id = ? AND business_id = ?"
    ).run(pointsUsed, memberId, businessId);
    createTransaction({
      businessId,
      memberId,
      type: "points_redeem_game_tickets",
      points: -pointsUsed,
      metadata: { source: "game_tickets_convert", tickets_added: tickets, points_per_ticket: pointsPerTicket },
    });
    db.prepare(
      `INSERT INTO ticket_ledger
       (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
       VALUES (?, ?, ?, 'convert', ?, ?, 'points', ?, ?, ?, datetime('now'))`
    ).run(
      randomUUID(),
      businessId,
      memberId,
      tickets,
      nextBalance,
      memberId,
      idempotencyKey || null,
      metadata == null ? null : JSON.stringify(metadata)
    );
    return {
      ok: true,
      idempotent: false,
      wallet: ensureMemberTicketWallet(businessId, memberId),
      member: getMemberForBusiness(memberId, businessId),
      converted_points: pointsUsed,
      tickets_added: tickets,
    };
  });
  return tx();
}

function pickWeightedReward(rewards) {
  const active = rewards.filter((r) => r.active && Number(r.weight) > 0);
  if (active.length === 0) return null;
  const totalWeight = active.reduce((sum, r) => sum + Number(r.weight), 0);
  if (totalWeight <= 0) return null;
  let cursor = Math.random() * totalWeight;
  for (const reward of active) {
    cursor -= Number(reward.weight);
    if (cursor <= 0) return reward;
  }
  return active[active.length - 1];
}

export function spinGameForMember({
  businessId,
  memberId,
  gameCode = "roulette",
  idempotencyKey = null,
  clientIpHash = null,
  deviceHash = null,
  riskScore = 0,
}) {
  const tx = db.transaction(() => {
    if (idempotencyKey) {
      const existing = db
        .prepare(
          `SELECT s.*, w.ticket_balance
           FROM game_spins s
           LEFT JOIN member_ticket_wallets w ON w.member_id = s.member_id AND w.business_id = s.business_id
           WHERE s.business_id = ? AND s.idempotency_key = ? LIMIT 1`
        )
        .get(businessId, idempotencyKey);
      if (existing) {
        const reward = existing.reward_id
          ? db.prepare("SELECT * FROM game_rewards WHERE id = ?").get(existing.reward_id)
          : null;
        return {
          ok: true,
          idempotent: true,
          spin: existing,
          reward: reward ? { ...reward, value: parseJsonSafe(reward.value_json, null), active: Number(reward.active) === 1 } : null,
          ticket_balance: Number(existing.ticket_balance) || 0,
        };
      }
    }
    const business = getBusinessById(businessId);
    if (!business) return { error: "business_not_found" };
    if ((business.loyalty_mode || "points_cash") !== "points_game_tickets") {
      return { error: "mode_disabled" };
    }
    const member = getMemberForBusiness(memberId, businessId);
    if (!member) return { error: "member_not_found" };
    const game = ensureBusinessGame(businessId, gameCode);
    if (!game || !game.enabled) return { error: "game_disabled" };
    seedDefaultGameRewards(businessId, game.game_id);
    const wallet = ensureMemberTicketWallet(businessId, memberId);
    const ticketCost = Math.max(1, Number(game.ticket_cost) || 1);
    const currentBalance = Number(wallet?.ticket_balance) || 0;
    if (currentBalance < ticketCost) return { error: "not_enough_tickets", ticket_cost: ticketCost, ticket_balance: currentBalance };

    const dailyLimit = Math.max(0, Number(game.daily_spin_limit) || 0);
    if (dailyLimit > 0) {
      const todayCount = db
        .prepare(
          `SELECT COUNT(*) as n
           FROM game_spins
           WHERE business_id = ? AND member_id = ? AND game_id = ?
             AND created_at >= datetime('now', 'start of day')`
        )
        .get(businessId, memberId, game.game_id)?.n;
      if ((todayCount || 0) >= dailyLimit) return { error: "daily_limit_reached" };
    }
    const cooldownSeconds = Math.max(0, Number(game.cooldown_seconds) || 0);
    if (cooldownSeconds > 0) {
      const lastSpin = db
        .prepare(
          `SELECT id FROM game_spins
           WHERE business_id = ? AND member_id = ? AND game_id = ?
             AND created_at >= datetime('now', '-' || ? || ' seconds')
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(businessId, memberId, game.game_id, cooldownSeconds);
      if (lastSpin) return { error: "cooldown_active", cooldown_seconds: cooldownSeconds };
    }

    const nextBalance = currentBalance - ticketCost;
    db.prepare(
      "UPDATE member_ticket_wallets SET ticket_balance = ?, updated_at = datetime('now') WHERE member_id = ? AND business_id = ?"
    ).run(nextBalance, memberId, businessId);
    const spinId = randomUUID();
    db.prepare(
      `INSERT INTO ticket_ledger
       (id, business_id, member_id, source_type, delta, balance_after, reference_type, reference_id, idempotency_key, metadata_json, created_at)
       VALUES (?, ?, ?, 'consume', ?, ?, 'spin', ?, ?, ?, datetime('now'))`
    ).run(
      randomUUID(),
      businessId,
      memberId,
      -ticketCost,
      nextBalance,
      spinId,
      idempotencyKey || null,
      JSON.stringify({ game_code: gameCode, ticket_cost: ticketCost })
    );

    const rewards = getGameRewardsForBusiness(businessId, gameCode);
    const reward = pickWeightedReward(rewards);
    const isWinning = !!reward && reward.kind !== "none";
    let grantedRewardId = reward?.id || null;
    let outcomeCode = reward?.code || "none";
    let status = isWinning ? "won" : "lost";
    let grant = null;
    if (reward && reward.kind === "points") {
      const bonusPoints = Math.max(0, Number(reward.value?.points) || 0);
      if (bonusPoints > 0) {
        addPoints(memberId, bonusPoints);
        createTransaction({
          businessId,
          memberId,
          type: "points_add",
          points: bonusPoints,
          metadata: { source: "game_spin", game_code: gameCode, reward_code: reward.code },
        });
      }
      grant = {
        id: randomUUID(),
        business_id: businessId,
        member_id: memberId,
        spin_id: spinId,
        reward_id: reward.id,
        status: "granted",
        metadata_json: JSON.stringify({ reward_kind: "points", points: bonusPoints }),
      };
    } else if (reward && reward.kind !== "none") {
      grant = {
        id: randomUUID(),
        business_id: businessId,
        member_id: memberId,
        spin_id: spinId,
        reward_id: reward.id,
        status: "granted",
        metadata_json: JSON.stringify({ reward_kind: reward.kind, value: reward.value || null }),
      };
    }

    db.prepare(
      `INSERT INTO game_spins
       (id, business_id, member_id, game_id, status, ticket_cost, rng_seed_hash, outcome_code, reward_id, idempotency_key, risk_score, client_ip_hash, device_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      spinId,
      businessId,
      memberId,
      game.game_id,
      status,
      ticketCost,
      randomUUID(),
      outcomeCode,
      grantedRewardId,
      idempotencyKey || null,
      Number(riskScore) || 0,
      clientIpHash,
      deviceHash
    );

    if (grant) {
      db.prepare(
        `INSERT INTO reward_grants
         (id, business_id, member_id, spin_id, reward_id, status, granted_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`
      ).run(grant.id, grant.business_id, grant.member_id, grant.spin_id, grant.reward_id, grant.status, grant.metadata_json);
    }

    const freshSpin = db.prepare("SELECT * FROM game_spins WHERE id = ?").get(spinId);
    return {
      ok: true,
      idempotent: false,
      spin: freshSpin,
      reward: reward || null,
      ticket_balance: nextBalance,
      member_points: getMemberForBusiness(memberId, businessId)?.points ?? null,
    };
  });
  return tx();
}

export function getMemberRewards(businessId, memberId, limit = 30) {
  const rows = db
    .prepare(
      `SELECT rg.id, rg.status, rg.granted_at, rg.claimed_at, rg.expires_at, rg.metadata_json,
              gr.code, gr.label, gr.kind, gr.value_json
       FROM reward_grants rg
       JOIN game_rewards gr ON gr.id = rg.reward_id
       WHERE rg.business_id = ? AND rg.member_id = ?
       ORDER BY rg.granted_at DESC
       LIMIT ?`
    )
    .all(businessId, memberId, Math.max(1, Math.min(100, Number(limit) || 30)));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    granted_at: row.granted_at,
    claimed_at: row.claimed_at,
    expires_at: row.expires_at,
    metadata: parseJsonSafe(row.metadata_json, null),
    reward: {
      code: row.code,
      label: row.label,
      kind: row.kind,
      value: parseJsonSafe(row.value_json, null),
    },
  }));
}

export function markRewardGrantClaimed(businessId, memberId, grantId) {
  const grant = db
    .prepare(
      `SELECT * FROM reward_grants
       WHERE id = ? AND business_id = ? AND member_id = ?`
    )
    .get(grantId, businessId, memberId);
  if (!grant || grant.status !== "granted") return null;
  db.prepare(
    "UPDATE reward_grants SET status = 'claimed', claimed_at = datetime('now') WHERE id = ?"
  ).run(grantId);
  return db.prepare("SELECT * FROM reward_grants WHERE id = ?").get(grantId) || null;
}

// ——— Avis & Réseaux (engagement_rewards, engagement_completions) ———

const DEFAULT_ENGAGEMENT_REWARDS = {
  google_review: { enabled: false, points: 50, place_id: "", require_approval: true, auto_verify_enabled: true },
  instagram_follow: { enabled: false, points: 10, url: "" },
  tiktok_follow: { enabled: false, points: 10, url: "" },
  facebook_follow: { enabled: false, points: 10, url: "" },
};

/** Retourne la config engagement d'une business (objet). */
export function getEngagementRewards(businessId) {
  const b = getBusinessById(businessId);
  if (!b || !b.engagement_rewards) return { ...DEFAULT_ENGAGEMENT_REWARDS };
  try {
    const parsed = typeof b.engagement_rewards === "string" ? JSON.parse(b.engagement_rewards) : b.engagement_rewards;
    return { ...DEFAULT_ENGAGEMENT_REWARDS, ...parsed };
  } catch (_) {
    return { ...DEFAULT_ENGAGEMENT_REWARDS };
  }
}

/** Vérifie si un membre a déjà complété une action (une fois par an par défaut pour avis Google). */
export function hasMemberCompletedEngagementAction(businessId, memberId, actionType, cooldownMonths = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - cooldownMonths);
  const sinceStr = since.toISOString();
  const row = db
    .prepare(
      `SELECT 1 FROM engagement_completions
       WHERE business_id = ? AND member_id = ? AND action_type = ? AND status IN ('approved', 'pending', 'pending_review')
       AND created_at >= ? LIMIT 1`
    )
    .get(businessId, memberId, actionType, sinceStr);
  return !!row;
}

/** Crée une completion (pending ou approved selon config). Retourne { completion, pointsGranted, alreadyDone }. */
export function createEngagementCompletion(businessId, memberId, actionType, options = {}) {
  const rewards = getEngagementRewards(businessId);
  const config = rewards[actionType];
  if (!config || !config.enabled || (config.points && config.points < 1)) {
    return { error: "action_disabled" };
  }
  const points = Math.max(0, Math.floor(Number(config.points) || 0));
  const cooldown = Number.isFinite(Number(options.cooldownMonths))
    ? Number(options.cooldownMonths)
    : (actionType === "google_review" ? 12 : 120); // 12 mois avis, 120 mois (10 ans) pour follow = quasi une fois
  if (hasMemberCompletedEngagementAction(businessId, memberId, actionType, cooldown)) {
    return { error: "already_done", alreadyDone: true };
  }
  const requireApproval = actionType === "google_review" && config.require_approval;
  const forcedStatus = ["approved", "pending", "pending_review"].includes(options.statusOverride) ? options.statusOverride : null;
  const status = forcedStatus || (requireApproval ? "pending" : "approved");
  const defaultTickets = actionType === "google_review" ? 2 : 1;
  const ticketsToGrant = status === "approved" ? Math.min(10, Math.max(1, Math.floor(Number(config.points) || defaultTickets))) : 0;
  const pointsGranted = 0;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO engagement_completions (id, business_id, member_id, action_type, points_granted, status, proof_id, proof_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    businessId,
    memberId,
    actionType,
    pointsGranted,
    status,
    options.proofId || null,
    Number.isFinite(Number(options.proofScore)) ? Number(options.proofScore) : null
  );
  if (status === "approved" && ticketsToGrant > 0) {
    addTicketsForEngagement(businessId, memberId, ticketsToGrant, actionType, id);
  }
  const completion = db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(id);
  return { completion, pointsGranted: 0, ticketsGranted: ticketsToGrant, status, alreadyDone: false };
}

/** Liste des completions pour une business (pending + récentes). */
export function getEngagementCompletionsForBusiness(businessId, { status = null, limit = 50 } = {}) {
  let sql = `SELECT c.*, m.name as member_name, m.email as member_email
    FROM engagement_completions c
    JOIN members m ON m.id = c.member_id
    WHERE c.business_id = ?`;
  const params = [businessId];
  if (status && ["pending", "pending_review", "approved", "rejected"].includes(status)) {
    if (status === "pending") {
      sql += " AND c.status IN ('pending', 'pending_review')";
    } else {
      sql += " AND c.status = ?";
      params.push(status);
    }
  }
  sql += " ORDER BY c.created_at DESC LIMIT ?";
  params.push(limit);
  return db.prepare(sql).all(...params);
}

/** Approuver une completion : créditer les tickets (selon config engagement_rewards) et passer en approved. */
export function approveEngagementCompletion(completionId, businessId) {
  const c = db.prepare("SELECT * FROM engagement_completions WHERE id = ? AND business_id = ?").get(completionId, businessId);
  if (!c || (c.status !== "pending" && c.status !== "pending_review")) return null;
  const rewards = getEngagementRewards(businessId);
  const config = rewards[c.action_type];
  const defaultTickets = c.action_type === "google_review" ? 2 : 1;
  const tickets = Math.min(10, Math.max(1, Math.floor(Number(config?.points) || defaultTickets)));
  db.prepare(
    "UPDATE engagement_completions SET status = 'approved', points_granted = 0, reviewed_at = datetime('now') WHERE id = ?"
  ).run(completionId);
  addTicketsForEngagement(businessId, c.member_id, tickets, c.action_type, completionId);
  return db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(completionId);
}

/** Rejeter une completion. */
export function rejectEngagementCompletion(completionId, businessId) {
  const c = db.prepare("SELECT * FROM engagement_completions WHERE id = ? AND business_id = ?").get(completionId, businessId);
  if (!c || (c.status !== "pending" && c.status !== "pending_review")) return null;
  db.prepare(
    "UPDATE engagement_completions SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?"
  ).run(completionId);
  return db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(completionId);
}

/** Completions déjà faites par un membre (pour affichage client). */
export function getEngagementCompletionsForMember(businessId, memberId) {
  return db
    .prepare(
      `SELECT action_type, points_granted, status, created_at FROM engagement_completions
       WHERE business_id = ? AND member_id = ? ORDER BY created_at DESC`
    )
    .all(businessId, memberId);
}

export function createEngagementProof({
  id,
  businessId,
  memberId,
  actionType,
  nonce,
  tokenHash,
  expiresAt,
  startIpHash = null,
  startDeviceHash = null,
}) {
  db.prepare(
    `INSERT INTO engagement_proofs
     (id, business_id, member_id, action_type, nonce, token_hash, status, start_ip_hash, start_device_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?, datetime('now'))`
  ).run(id, businessId, memberId, actionType, nonce, tokenHash, startIpHash, startDeviceHash, expiresAt);
  return db.prepare("SELECT * FROM engagement_proofs WHERE id = ?").get(id);
}

export function getEngagementProofById(proofId) {
  return db.prepare("SELECT * FROM engagement_proofs WHERE id = ?").get(proofId) || null;
}

export function getEngagementProofByTokenHash(tokenHash) {
  return db.prepare("SELECT * FROM engagement_proofs WHERE token_hash = ?").get(tokenHash) || null;
}

export function markEngagementProofReturned(proofId, returnIpHash = null) {
  db.prepare(
    `UPDATE engagement_proofs
     SET status = CASE WHEN status = 'started' THEN 'returned' ELSE status END,
         returned_at = COALESCE(returned_at, datetime('now')),
         return_ip_hash = COALESCE(return_ip_hash, ?)
     WHERE id = ?`
  ).run(returnIpHash, proofId);
  return getEngagementProofById(proofId);
}

export function incrementEngagementProofAttempts(proofId) {
  db.prepare("UPDATE engagement_proofs SET attempt_count = attempt_count + 1 WHERE id = ?").run(proofId);
  return getEngagementProofById(proofId);
}

export function finalizeEngagementProof({
  proofId,
  status,
  score = 0,
  reasons = [],
  completionId = null,
  claimIpHash = null,
  claimDeviceHash = null,
}) {
  db.prepare(
    `UPDATE engagement_proofs
     SET status = ?, score = ?, reasons = ?, completion_id = ?, claim_ip_hash = ?, claim_device_hash = ?, claimed_at = datetime('now')
     WHERE id = ?`
  ).run(
    status,
    Number(score) || 0,
    Array.isArray(reasons) ? JSON.stringify(reasons) : null,
    completionId,
    claimIpHash,
    claimDeviceHash,
    proofId
  );
  return getEngagementProofById(proofId);
}

export function countRecentEngagementProofStarts({ businessId, memberId, actionType, sinceMinutes = 5 }) {
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM engagement_proofs
     WHERE business_id = ? AND member_id = ? AND action_type = ?
       AND created_at >= datetime('now', '-' || ? || ' minutes')`
  ).get(businessId, memberId, actionType, Math.max(1, Number(sinceMinutes) || 5));
  return row?.n ?? 0;
}

/** Périodes supportées pour le dashboard: 7d, 30d, this_month, 6m */
function getPeriodBounds(period) {
  const now = new Date();
  switch (period) {
    case "7d":
      return { since: "datetime('now', '-7 days')", label: "7 jours" };
    case "30d":
      return { since: "datetime('now', '-30 days')", label: "30 jours" };
    case "this_month":
      return { since: null, month: now.toISOString().slice(0, 7), label: "Ce mois-ci" };
    case "6m":
      return { since: "datetime('now', '-6 months')", label: "6 mois" };
    default:
      return { since: null, month: now.toISOString().slice(0, 7), label: "Ce mois-ci" };
  }
}

export function getDashboardStats(businessId, period = "this_month") {
  const bounds = getPeriodBounds(period);
  const membersCount = db.prepare("SELECT COUNT(*) as n FROM members WHERE business_id = ?").get(businessId);
  const pointsInPeriod =
    bounds.month != null
      ? db.prepare(
          `SELECT COALESCE(SUM(points), 0) as total FROM transactions WHERE business_id = ? AND type = 'points_add' AND strftime('%Y-%m', created_at) = ?`
        ).get(businessId, bounds.month)
      : db.prepare(
          `SELECT COALESCE(SUM(points), 0) as total FROM transactions WHERE business_id = ? AND type = 'points_add' AND created_at >= ${bounds.since}`
        ).get(businessId);
  const transactionsInPeriod =
    bounds.month != null
      ? db.prepare(
          `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ?`
        ).get(businessId, bounds.month)
      : db.prepare(
          `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since}`
        ).get(businessId);
  const newMembers7d = db.prepare(
    "SELECT COUNT(*) as n FROM members WHERE business_id = ? AND created_at >= datetime('now', '-7 days')"
  ).get(businessId);
  const newMembers30d = db.prepare(
    "SELECT COUNT(*) as n FROM members WHERE business_id = ? AND created_at >= datetime('now', '-30 days')"
  ).get(businessId);
  const inactive30d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))`
  ).get(businessId);
  const inactive90d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))`
  ).get(businessId);
  const pointsAvg = db.prepare(
    "SELECT COALESCE(ROUND(AVG(points), 0), 0) as avg FROM members WHERE business_id = ?"
  ).get(businessId);

  // CA estimé : somme des amount_eur dans metadata (ou estimation points / points_per_euro)
  let estimatedRevenueEur = 0;
  try {
    if (bounds.month != null) {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total
         FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ? AND metadata IS NOT NULL`
      ).get(businessId, bounds.month);
      estimatedRevenueEur = row?.total ?? 0;
    } else {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total
         FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since} AND metadata IS NOT NULL`
      ).get(businessId);
      estimatedRevenueEur = row?.total ?? 0;
    }
  } catch (_) {}
  const business = getBusinessById(businessId);
  const pointsPerEuro = business?.points_per_euro != null ? Number(business.points_per_euro) : 1;
  if (estimatedRevenueEur <= 0 && (pointsInPeriod?.total ?? 0) > 0 && pointsPerEuro > 0) {
    estimatedRevenueEur = (pointsInPeriod.total ?? 0) / pointsPerEuro;
  }

  // Membres actifs sur la période (au moins une opération)
  const activeInPeriod =
    bounds.month != null
      ? db.prepare(
          `SELECT COUNT(DISTINCT member_id) as n FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ?`
        ).get(businessId, bounds.month)
      : db.prepare(
          `SELECT COUNT(DISTINCT member_id) as n FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since}`
        ).get(businessId);
  const totalMembers = membersCount?.n ?? 0;
  const retentionPct = totalMembers > 0 ? Math.round(((activeInPeriod?.n ?? 0) / totalMembers) * 100) : 0;

  // Récurrents : membres avec au moins 2 opérations sur la période
  let recurrentInPeriod = { n: 0 };
  try {
    recurrentInPeriod =
      bounds.month != null
        ? db.prepare(
            `SELECT COUNT(*) as n FROM (SELECT member_id FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ? GROUP BY member_id HAVING COUNT(*) >= 2)`
          ).get(businessId, bounds.month)
        : db.prepare(
            `SELECT COUNT(*) as n FROM (SELECT member_id FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since} GROUP BY member_id HAVING COUNT(*) >= 2)`
          ).get(businessId);
  } catch (_) {}

  return {
    period: bounds.label,
    periodKey: period,
    membersCount: totalMembers,
    pointsThisMonth: pointsInPeriod?.total ?? 0,
    transactionsThisMonth: transactionsInPeriod?.n ?? 0,
    newMembersLast7Days: newMembers7d?.n ?? 0,
    newMembersLast30Days: newMembers30d?.n ?? 0,
    inactiveMembers30Days: inactive30d?.n ?? 0,
    inactiveMembers90Days: inactive90d?.n ?? 0,
    pointsAveragePerMember: pointsAvg?.avg ?? 0,
    estimatedRevenueEur: Math.round(estimatedRevenueEur * 100) / 100,
    activeMembersInPeriod: activeInPeriod?.n ?? 0,
    retentionPct,
    recurrentMembersInPeriod: recurrentInPeriod?.n ?? 0,
  };
}

/** Évolution hebdo sur les 6 dernières semaines (pour graphique). */
export function getDashboardEvolution(businessId, weeks = 6) {
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = `datetime('now', '-${i + 1} weeks')`;
    const end = i === 0 ? "datetime('now')" : `datetime('now', '-${i} weeks')`;
    const op = db.prepare(
      `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND created_at >= ${start} AND created_at < ${end}`
    ).get(businessId);
    const members = db.prepare(
      `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND created_at < ${end}`
    ).get(businessId);
    rows.push({
      weekIndex: i,
      operationsCount: op?.n ?? 0,
      membersCount: members?.n ?? 0,
    });
  }
  return rows;
}

export function registerPassDevice({ deviceLibraryIdentifier, passTypeIdentifier, serialNumber, pushToken }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO pass_registrations (device_library_identifier, pass_type_identifier, serial_number, push_token, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(deviceLibraryIdentifier, passTypeIdentifier, serialNumber, pushToken || null, now);
}

const TEST_DEVICE_ID = "test-device-123";

/** Enregistre ou met à jour le token APNs de l'app commerçant (iOS) pour un utilisateur. */
export function upsertMerchantDeviceToken(userId, deviceToken) {
  if (!userId || !deviceToken || typeof deviceToken !== "string" || !deviceToken.trim()) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO merchant_device_tokens (user_id, device_token, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET device_token = excluded.device_token, updated_at = excluded.updated_at`
  ).run(userId, deviceToken.trim(), now);
}

/** Tokens push pour un membre (Apple Wallet) — pour envoyer une notif après mise à jour des points. */
export function getPushTokensForMember(serialNumber) {
  const rows = db.prepare(
    `SELECT push_token FROM pass_registrations
     WHERE serial_number = ? AND push_token IS NOT NULL AND push_token != '' AND device_library_identifier != ?`
  ).all(serialNumber, TEST_DEVICE_ID);
  return rows.map((r) => r.push_token).filter(Boolean);
}

/** Tous les tokens PassKit (Apple Wallet) pour les membres d'un commerce — pour envoi notifications APNs. Exclut l'appareil de test (curl). */
export function getPassKitPushTokensForBusiness(businessId) {
  const rows = db.prepare(
    `SELECT pr.push_token, pr.serial_number
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE m.business_id = ? AND pr.push_token IS NOT NULL AND pr.push_token != ''
       AND pr.device_library_identifier != ?`
  ).all(businessId, TEST_DEVICE_ID);
  return rows;
}

/** Nombre d'appareils PassKit enregistrés pour un commerce (avec ou sans token push, hors appareil de test — pour affichage dashboard). */
export function getPassKitRegistrationsCountForBusiness(businessId) {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE m.business_id = ? AND pr.device_library_identifier != ?`
  ).get(businessId, TEST_DEVICE_ID);
  return row?.n ?? 0;
}

/** Total d'enregistrements PassKit (diagnostic au démarrage). */
export function getPassRegistrationsTotalCount() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM pass_registrations").get();
  return row?.n ?? 0;
}

export function unregisterPassDevice(deviceLibraryIdentifier, passTypeIdentifier, serialNumber) {
  db.prepare(
    "DELETE FROM pass_registrations WHERE device_library_identifier = ? AND pass_type_identifier = ? AND serial_number = ?"
  ).run(deviceLibraryIdentifier, passTypeIdentifier, serialNumber);
}

/** Parse une date SQLite ou ISO en timestamp (ms) pour comparaison fiable. */
function parsePassUpdatedAt(str) {
  if (!str || typeof str !== "string") return 0;
  const s = str.trim();
  const iso = s.replace(" ", "T").replace(/Z?$/, "Z");
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Liste des serial numbers (passes) mis à jour pour un device — pour GET /v1/devices/:deviceId/registrations/:passTypeId.
 * Si passesUpdatedSince est fourni, ne retourne que les passes dont last_visit_at > passesUpdatedSince.
 * Comparaison en timestamp pour éviter les erreurs de format (SQLite vs ISO envoyé par Apple).
 * @returns { { serialNumbers: string[], lastUpdated: string } }
 */
export function getUpdatedPassSerialNumbersForDevice(deviceId, passTypeId, passesUpdatedSince = null) {
  const base = db.prepare(
    `SELECT pr.serial_number, m.last_visit_at
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE pr.device_library_identifier = ? AND pr.pass_type_identifier = ?`
  ).all(deviceId, passTypeId);
  let list = base;
  if (passesUpdatedSince && String(passesUpdatedSince).trim()) {
    const sinceTs = parsePassUpdatedAt(String(passesUpdatedSince));
    list = base.filter((r) => {
      const ts = parsePassUpdatedAt(r.last_visit_at);
      return ts > sinceTs;
    });
  }
  const serialNumbers = list.map((r) => r.serial_number);
  let lastUpdated = new Date().toISOString().replace("T", " ").slice(0, 19);
  if (list.length > 0) {
    const withDate = list.filter((r) => r.last_visit_at).map((r) => ({ ...r, ts: parsePassUpdatedAt(r.last_visit_at) }));
    if (withDate.length > 0) {
      const maxRow = withDate.reduce((a, b) => (a.ts >= b.ts ? a : b));
      lastUpdated = maxRow.last_visit_at;
    }
  }
  return { serialNumbers, lastUpdated };
}

/** Supprime l'appareil de test (curl) pour un commerce, pour remettre le compteur à 0. */
export function removeTestPassKitDevices(businessId) {
  const r = db.prepare(
    "DELETE FROM pass_registrations WHERE device_library_identifier = 'test-device-123' AND serial_number IN (SELECT id FROM members WHERE business_id = ?)"
  ).run(businessId);
  return r.changes;
}

// ——— Web Push (notifications navigateur / PWA) ———
export function saveWebPushSubscription({ businessId, memberId, endpoint, p256dh, auth }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO web_push_subscriptions (id, business_id, member_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, businessId, memberId, endpoint, p256dh, auth, now);
  return id;
}

export function getWebPushSubscriptionsByBusiness(businessId) {
  return db.prepare(
    "SELECT id, member_id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE business_id = ?"
  ).all(businessId);
}

export function getWebPushSubscriptionsByMemberIds(businessId, memberIds) {
  if (!memberIds?.length) return [];
  const placeholders = memberIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT id, member_id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE business_id = ? AND member_id IN (${placeholders})`
  ).all(businessId, ...memberIds);
}

export function logNotification({ businessId, memberId, title, body, type = "web_push" }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notification_log (id, business_id, member_id, title, body, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, businessId, memberId || null, title || null, body, type, now);
  return id;
}

const MEMBER_ORDER = { last_visit: "COALESCE(last_visit_at, '') DESC", points: "points DESC", name: "name ASC", created: "created_at DESC" };

export function getMembersForBusiness(businessId, { search = "", limit = 50, offset = 0, filter = null, sort = "last_visit" } = {}) {
  const q = search.trim() ? "%" + search.trim().replace(/%/g, "") + "%" : null;
  const orderBy = MEMBER_ORDER[sort] || MEMBER_ORDER.last_visit;
  let where = "business_id = ?";
  const params = [businessId];
  if (q) {
    where += " AND (name LIKE ? OR email LIKE ?)";
    params.push(q, q);
  }
  if (filter === "inactive30") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))";
  } else if (filter === "inactive90") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))";
  } else if (filter === "points50") {
    where += " AND points >= 50";
  }
  const stmt = db.prepare(
    `SELECT id, name, email, points, created_at, last_visit_at FROM members WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) as n FROM members WHERE ${where}`);
  const rows = stmt.all(...params, limit, offset);
  const total = countStmt.get(...params)?.n ?? 0;
  const members = rows.map((m) => ({ ...m, category_ids: getCategoryIdsForMember(m.id) }));
  return { members, total };
}

export function getTransactionsForBusiness(businessId, { limit = 30, offset = 0, memberId = null, days = null, type = null } = {}) {
  let where = "t.business_id = ?";
  const params = [businessId];
  if (memberId) {
    where += " AND t.member_id = ?";
    params.push(memberId);
  }
  if (days === 7 || days === 30 || days === 90) {
    where += ` AND t.created_at >= datetime('now', '-${days} days')`;
  }
  if (type === "visit") {
    where += " AND t.type = 'points_add' AND (t.metadata LIKE '%\"visit\":true%' OR t.metadata LIKE '%\"visit\": true%')";
  } else if (type === "points_add") {
    where += " AND t.type = 'points_add'";
  }
  const stmt = db.prepare(
    `SELECT t.id, t.member_id, t.type, t.points, t.metadata, t.created_at, m.name as member_name, m.email as member_email
     FROM transactions t JOIN members m ON t.member_id = m.id
     WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(
    `SELECT COUNT(*) as n FROM transactions t WHERE ${where}`
  );
  const countParams = params.slice();
  params.push(limit, offset);
  const rows = stmt.all(...params);
  const total = countStmt.get(...countParams)?.n ?? 0;
  return { transactions: rows, total };
}

export function getLevel(points) {
  if (points >= 500) return "Or";
  if (points >= 200) return "Argent";
  if (points >= 50) return "Bronze";
  return "Débutant";
}

export function ensureDefaultBusiness() {
  let b = getBusinessBySlug("demo");
  if (!b) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "Demo Fast-Food",
      "demo",
      "Demo Fast-Food",
      "1 point = 1 € de réduction. Valable en magasin.",
      "contact@example.com"
    );
    b = getBusinessBySlug("demo");
  }
  return b;
}

ensureDefaultBusiness();

// Générer dashboard_token pour les businesses qui n'en ont pas (après ensureDemoBusiness)
const bizColsFinal = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (bizColsFinal.includes("dashboard_token")) {
  const needToken = db.prepare("SELECT id FROM businesses WHERE dashboard_token IS NULL OR dashboard_token = ''").all();
  for (const row of needToken) {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
    db.prepare("UPDATE businesses SET dashboard_token = ? WHERE id = ?").run(token, row.id);
  }
}

// Colonne last_broadcast_message : pour afficher une notif Wallet quand on envoie depuis la section Notifications (PassKit n'affiche que si un champ avec changeMessage change)
if (!bizColsFinal.includes("last_broadcast_message")) {
  try {
    db.prepare("ALTER TABLE businesses ADD COLUMN last_broadcast_message TEXT").run();
  } catch (_) {}
}
if (!bizColsFinal.includes("last_broadcast_at")) {
  try {
    db.prepare("ALTER TABLE businesses ADD COLUMN last_broadcast_at TEXT").run();
  } catch (_) {}
}
if (!bizColsFinal.includes("notification_title_override")) {
  try {
    db.prepare("ALTER TABLE businesses ADD COLUMN notification_title_override TEXT").run();
  } catch (_) {}
}
if (!bizColsFinal.includes("notification_change_message")) {
  try {
    db.prepare("ALTER TABLE businesses ADD COLUMN notification_change_message TEXT").run();
  } catch (_) {}
}

// ——— Catégories de membres (classement par le commerçant, ciblage notifications) ———
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_categories (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color_hex TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );
    CREATE TABLE IF NOT EXISTS member_category_assignments (
      member_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (member_id, category_id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (category_id) REFERENCES member_categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_categories_business ON member_categories(business_id);
    CREATE INDEX IF NOT EXISTS idx_member_category_assignments_member ON member_category_assignments(member_id);
    CREATE INDEX IF NOT EXISTS idx_member_category_assignments_category ON member_category_assignments(category_id);
  `);
} catch (_) {}

export function getCategoriesForBusiness(businessId) {
  if (!businessId) return [];
  return db.prepare(
    "SELECT id, name, color_hex, sort_order FROM member_categories WHERE business_id = ? ORDER BY sort_order ASC, name ASC"
  ).all(businessId);
}

export function createCategory({ id: catId, businessId, name, colorHex, sortOrder = 0 }) {
  const id = catId || randomUUID();
  db.prepare(
    "INSERT INTO member_categories (id, business_id, name, color_hex, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).run(id, businessId, String(name).trim(), colorHex ? String(colorHex).trim() : null, Number(sortOrder) || 0);
  return db.prepare("SELECT id, name, color_hex, sort_order FROM member_categories WHERE id = ?").get(id);
}

export function getCategoryById(categoryId) {
  if (!categoryId) return null;
  return db.prepare("SELECT id, business_id, name, color_hex, sort_order FROM member_categories WHERE id = ?").get(categoryId);
}

export function updateCategory(categoryId, { name, colorHex, sortOrder }) {
  const cat = getCategoryById(categoryId);
  if (!cat) return null;
  const updates = [];
  const values = [];
  if (name !== undefined) {
    updates.push("name = ?");
    values.push(String(name).trim());
  }
  if (colorHex !== undefined) {
    updates.push("color_hex = ?");
    values.push(colorHex ? String(colorHex).trim() : null);
  }
  if (sortOrder !== undefined) {
    updates.push("sort_order = ?");
    values.push(Number(sortOrder) || 0);
  }
  if (updates.length === 0) return cat;
  values.push(categoryId);
  db.prepare(`UPDATE member_categories SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getCategoryById(categoryId);
}

export function deleteCategory(categoryId) {
  if (!categoryId) return false;
  db.prepare("DELETE FROM member_category_assignments WHERE category_id = ?").run(categoryId);
  const r = db.prepare("DELETE FROM member_categories WHERE id = ?").run(categoryId);
  return r.changes > 0;
}

export function getCategoryIdsForMember(memberId) {
  if (!memberId) return [];
  const rows = db.prepare("SELECT category_id FROM member_category_assignments WHERE member_id = ?").all(memberId);
  return rows.map((r) => r.category_id);
}

export function setMemberCategories(memberId, categoryIds) {
  if (!memberId) return;
  db.prepare("DELETE FROM member_category_assignments WHERE member_id = ?").run(memberId);
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return;
  const stmt = db.prepare("INSERT INTO member_category_assignments (member_id, category_id) VALUES (?, ?)");
  for (const cid of categoryIds) {
    if (cid && getCategoryById(cid)) stmt.run(memberId, cid);
  }
}

/** Tokens PassKit pour un commerce, optionnellement limités à une liste de member_ids (pour notify par catégorie). */
export function getPassKitPushTokensForBusinessFiltered(businessId, memberIds = null) {
  const base = db.prepare(
    `SELECT pr.push_token, pr.serial_number
     FROM pass_registrations pr
     INNER JOIN members m ON m.id = pr.serial_number
     WHERE m.business_id = ? AND pr.push_token IS NOT NULL AND pr.push_token != ''
       AND pr.device_library_identifier != ?`
  );
  let rows = base.all(businessId, TEST_DEVICE_ID);
  if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const set = new Set(memberIds);
    rows = rows.filter((r) => set.has(r.serial_number));
  }
  return rows;
}

/** Web Push subscriptions pour un commerce, optionnellement limitées à une liste de member_ids. */
export function getWebPushSubscriptionsByBusinessFiltered(businessId, memberIds = null) {
  let rows = db.prepare(
    "SELECT id, member_id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE business_id = ?"
  ).all(businessId);
  if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const set = new Set(memberIds);
    rows = rows.filter((r) => set.has(r.member_id));
  }
  return rows;
}

/** IDs des membres ayant au moins une des catégories données (catégories du même business). */
export function getMemberIdsInCategories(businessId, categoryIds) {
  if (!businessId || !Array.isArray(categoryIds) || categoryIds.length === 0) return [];
  const cats = db.prepare(
    "SELECT id FROM member_categories WHERE business_id = ? AND id IN (" + categoryIds.map(() => "?").join(",") + ")"
  ).all(businessId, ...categoryIds);
  const validIds = cats.map((c) => c.id);
  if (validIds.length === 0) return [];
  const rows = db.prepare(
    "SELECT DISTINCT member_id FROM member_category_assignments WHERE category_id IN (" + validIds.map(() => "?").join(",") + ")"
  ).all(...validIds);
  return rows.map((r) => r.member_id);
}

/** Met à jour le dernier message envoyé à tous (section Notifications). Permet d'afficher une notif sur l'écran de verrouillage Wallet. last_broadcast_at force le pass à être considéré modifié (Last-Modified) pour que l'iPhone refetch. */
export function setLastBroadcastMessage(businessId, message) {
  if (!businessId || message == null) return;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE businesses SET last_broadcast_message = ?, last_broadcast_at = ? WHERE id = ?").run(
    String(message).trim().slice(0, 500),
    now,
    businessId
  );
}

// ——— Abonnements (paiement) ———
const PLANS = { starter: { max_businesses: 1 }, pro: { max_businesses: 5 } };

export function getSubscriptionByUserId(userId) {
  const row = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").get(userId);
  return row || null;
}

export function hasActiveSubscription(userId) {
  const sub = getSubscriptionByUserId(userId);
  if (!sub) return false;
  return sub.status === "active" || sub.status === "trialing";
}

export function getBusinessCountByUserId(userId) {
  const row = db.prepare("SELECT COUNT(*) as c FROM businesses WHERE user_id = ?").get(userId);
  return (row && row.c) || 0;
}

export function canCreateBusiness(userId) {
  if (!userId) return false;
  if (!hasActiveSubscription(userId)) return false;
  const sub = getSubscriptionByUserId(userId);
  const plan = PLANS[sub.plan_id] || PLANS.starter;
  const count = getBusinessCountByUserId(userId);
  return count < plan.max_businesses;
}

export function createOrUpdateSubscription({ userId, stripeCustomerId, stripeSubscriptionId, planId, status, currentPeriodEnd }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const existing = getSubscriptionByUserId(userId);
  if (existing) {
    db.prepare(
      `UPDATE subscriptions SET stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id),
       plan_id = COALESCE(?, plan_id), status = ?, current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE user_id = ?`
    ).run(stripeCustomerId || null, stripeSubscriptionId || null, planId || null, status, currentPeriodEnd || null, now, userId);
    return getSubscriptionByUserId(userId);
  }
  db.prepare(
    `INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, stripeCustomerId || null, stripeSubscriptionId || null, planId || "starter", status, currentPeriodEnd || null);
  return getSubscriptionByUserId(userId);
}

export { PLANS };

/** Supprime toutes les données (comptes, cartes, membres, transactions, abonnements). Pour usage dev / reset. Ordre respectant les clés étrangères. */
export function resetAllData() {
  db.exec("DELETE FROM notification_log");
  db.exec("DELETE FROM reward_grants");
  db.exec("DELETE FROM game_spins");
  db.exec("DELETE FROM game_rewards");
  db.exec("DELETE FROM ticket_ledger");
  db.exec("DELETE FROM member_ticket_wallets");
  db.exec("DELETE FROM business_games");
  db.exec("DELETE FROM transactions");
  db.exec("DELETE FROM web_push_subscriptions");
  db.exec("DELETE FROM pass_registrations");
  db.exec("DELETE FROM member_category_assignments");
  db.exec("DELETE FROM member_categories");
  db.exec("DELETE FROM members");
  db.exec("DELETE FROM businesses");
  db.exec("DELETE FROM subscriptions");
  db.exec("DELETE FROM users");
}

export default db;
