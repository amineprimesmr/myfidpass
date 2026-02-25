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

  CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
  CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
`);

// Migration : ajouter business_id si ancienne base
const hasBusinessId = db.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "business_id");
if (!hasBusinessId) {
  db.exec("ALTER TABLE members ADD COLUMN business_id TEXT");
}
// Migration : couleurs personnalisées sur businesses
const bizCols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
for (const col of ["background_color", "foreground_color", "label_color"]) {
  if (!bizCols.includes(col)) {
    db.exec(`ALTER TABLE businesses ADD COLUMN ${col} TEXT`);
  }
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

export function getBusinessById(id) {
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  return row || null;
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
}) {
  const bid = id || randomUUID();
  db.prepare(
    `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact, background_color, foreground_color, label_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bid,
    name,
    slug,
    organizationName || name,
    backTerms || null,
    backContact || null,
    backgroundColor || null,
    foregroundColor || null,
    labelColor || null
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
  const stmt = db.prepare("UPDATE members SET points = points + ? WHERE id = ?");
  stmt.run(points, id);
  return getMember(id);
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

export default db;
