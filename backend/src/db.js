import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "fidelity.db");

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
`);

// Migration : ajouter business_id si ancienne base
const hasBusinessId = db.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "business_id");
if (!hasBusinessId) {
  db.exec("ALTER TABLE members ADD COLUMN business_id TEXT");
}
// Migration : couleurs personnalisées sur businesses
const bizCols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
for (const col of ["background_color", "foreground_color", "label_color", "points_per_euro", "points_per_visit", "dashboard_token"]) {
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
// Migration : user_id sur businesses (propriétaire du commerce)
const bizColsUser = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
if (!bizColsUser.includes("user_id")) {
  db.exec("ALTER TABLE businesses ADD COLUMN user_id TEXT REFERENCES users(id)");
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id)");
  } catch (_) {}
}
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

export function getBusinessBySlug(slug) {
  const row = db.prepare("SELECT * FROM businesses WHERE slug = ?").get(slug);
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

export function createMember({ id, businessId, email, name }) {
  const mid = id || randomUUID();
  db.prepare(
    "INSERT INTO members (id, business_id, email, name, points) VALUES (?, ?, ?, ?, 0)"
  ).run(mid, businessId, email, name);
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

export function addPoints(id, points) {
  const stmt = db.prepare("UPDATE members SET points = points + ?, last_visit_at = datetime('now') WHERE id = ?");
  stmt.run(points, id);
  return getMember(id);
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

export function getDashboardStats(businessId) {
  const now = new Date().toISOString().slice(0, 7);
  const membersCount = db.prepare("SELECT COUNT(*) as n FROM members WHERE business_id = ?").get(businessId);
  const pointsThisMonth = db.prepare(
    `SELECT COALESCE(SUM(points), 0) as total FROM transactions WHERE business_id = ? AND type = 'points_add' AND strftime('%Y-%m', created_at) = ?`
  ).get(businessId, now);
  const transactionsCount = db.prepare(
    `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ?`
  ).get(businessId, now);
  return {
    membersCount: membersCount?.n ?? 0,
    pointsThisMonth: pointsThisMonth?.total ?? 0,
    transactionsThisMonth: transactionsCount?.n ?? 0,
  };
}

export function getMembersForBusiness(businessId, { search = "", limit = 50, offset = 0 } = {}) {
  const q = search.trim() ? "%" + search.trim().replace(/%/g, "") + "%" : null;
  let stmt;
  let countStmt;
  if (q) {
    stmt = db.prepare(
      `SELECT id, name, email, points, created_at, last_visit_at FROM members WHERE business_id = ? AND (name LIKE ? OR email LIKE ?) ORDER BY COALESCE(last_visit_at, '') DESC, created_at DESC LIMIT ? OFFSET ?`
    );
    countStmt = db.prepare(
      "SELECT COUNT(*) as n FROM members WHERE business_id = ? AND (name LIKE ? OR email LIKE ?)"
    );
  } else {
    stmt = db.prepare(
      `SELECT id, name, email, points, created_at, last_visit_at FROM members WHERE business_id = ? ORDER BY COALESCE(last_visit_at, '') DESC, created_at DESC LIMIT ? OFFSET ?`
    );
    countStmt = db.prepare("SELECT COUNT(*) as n FROM members WHERE business_id = ?");
  }
  const rows = q ? stmt.all(businessId, q, q, limit, offset) : stmt.all(businessId, limit, offset);
  const total = q ? countStmt.get(businessId, q, q)?.n : countStmt.get(businessId)?.n;
  return { members: rows, total: total ?? 0 };
}

export function getTransactionsForBusiness(businessId, { limit = 30, offset = 0, memberId = null } = {}) {
  let stmt;
  let countStmt;
  if (memberId) {
    stmt = db.prepare(
      `SELECT t.id, t.member_id, t.type, t.points, t.metadata, t.created_at, m.name as member_name, m.email as member_email
       FROM transactions t JOIN members m ON t.member_id = m.id
       WHERE t.business_id = ? AND t.member_id = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
    );
    countStmt = db.prepare("SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND member_id = ?");
  } else {
    stmt = db.prepare(
      `SELECT t.id, t.member_id, t.type, t.points, t.metadata, t.created_at, m.name as member_name, m.email as member_email
       FROM transactions t JOIN members m ON t.member_id = m.id
       WHERE t.business_id = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
    );
    countStmt = db.prepare("SELECT COUNT(*) as n FROM transactions WHERE business_id = ?");
  }
  const rows = memberId ? stmt.all(businessId, memberId, limit, offset) : stmt.all(businessId, limit, offset);
  const total = memberId ? countStmt.get(businessId, memberId)?.n : countStmt.get(businessId)?.n;
  return { transactions: rows, total: total ?? 0 };
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

export default db;
