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
`);

// Migration : ajouter business_id si ancienne base
const hasBusinessId = db.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "business_id");
if (!hasBusinessId) {
  db.exec("ALTER TABLE members ADD COLUMN business_id TEXT");
}
// Migration : couleurs personnalisées sur businesses
const bizCols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
for (const col of ["background_color", "foreground_color", "label_color", "points_per_euro", "points_per_visit", "dashboard_token", "logo_base64"]) {
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
    "organization_name",
    "back_terms",
    "back_contact",
    "background_color",
    "foreground_color",
    "label_color",
    "logo_base64",
  ];
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (allowed.includes(col) && value !== undefined) {
      setClauses.push(`${col} = ?`);
      values.push(value === null || value === "" ? null : col === "logo_base64" ? String(value) : String(value).trim());
    }
  }
  if (setClauses.length === 0) return b;
  values.push(businessId);
  db.prepare(`UPDATE businesses SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  return getBusinessById(businessId);
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
  return {
    membersCount: membersCount?.n ?? 0,
    pointsThisMonth: pointsThisMonth?.total ?? 0,
    transactionsThisMonth: transactionsCount?.n ?? 0,
    newMembersLast7Days: newMembers7d?.n ?? 0,
    newMembersLast30Days: newMembers30d?.n ?? 0,
    inactiveMembers30Days: inactive30d?.n ?? 0,
    inactiveMembers90Days: inactive90d?.n ?? 0,
    pointsAveragePerMember: pointsAvg?.avg ?? 0,
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
  return { members: rows, total };
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

/** Supprime toutes les données (comptes, cartes, membres, transactions, abonnements). Pour usage dev / reset. */
export function resetAllData() {
  db.exec("DELETE FROM transactions");
  db.exec("DELETE FROM members");
  db.exec("DELETE FROM businesses");
  db.exec("DELETE FROM subscriptions");
  db.exec("DELETE FROM users");
}

export default db;
