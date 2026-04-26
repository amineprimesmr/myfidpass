/**
 * Migrations SQLite (ALTER TABLE, tables additionnelles, démo). Exécuté au démarrage après schema.
 * Référence : REFONTE-REGLES.md — db découpé par domaine.
 */
import { randomUUID } from "crypto";
import {
  DEMO_LOYALTY_MODE,
  DEMO_POINTS_REWARD_TIERS_JSON,
  DEMO_ENGAGEMENT_REWARDS_JSON,
} from "./demo-business-defaults.js";

function safeRun(db, fn) {
  try {
    fn();
  } catch (_e) {
    /* migration déjà appliquée ou ignorable */
  }
}

/**
 * Crée la table de versionnage des migrations si elle n'existe pas.
 * Permet de savoir précisément quelle version du schéma est en place.
 */
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Marque une migration comme appliquée (idempotent).
 */
function markMigrationApplied(db, version, name) {
  safeRun(db, () => {
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)"
    ).run(version, name);
  });
}

/**
 * Retourne la version max appliquée (0 si aucune).
 */
export function getSchemaVersion(db) {
  ensureMigrationsTable(db);
  const row = db.prepare("SELECT MAX(version) as v FROM schema_migrations").get();
  return row?.v ?? 0;
}

export function runMigrations(db) {
  ensureMigrationsTable(db);
  // Marquer toutes les migrations existantes comme v1 (première initialisation)
  markMigrationApplied(db, 1, "initial_schema_and_columns");
  const hasBusinessId = db.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "business_id");
  if (!hasBusinessId) {
    db.exec("ALTER TABLE members ADD COLUMN business_id TEXT");
  }

  const bizCols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  for (const col of ["background_color", "foreground_color", "label_color", "points_per_euro", "points_per_visit", "dashboard_token", "logo_base64", "logo_updated_at"]) {
    if (!bizCols.includes(col)) {
      db.exec(`ALTER TABLE businesses ADD COLUMN ${col} TEXT`);
    }
  }
  const bizCols2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (bizCols2.includes("points_per_euro")) {
    safeRun(db, () => db.exec(`UPDATE businesses SET points_per_euro = '1' WHERE points_per_euro IS NULL`));
  }
  if (bizCols2.includes("points_per_visit")) {
    safeRun(db, () => db.exec(`UPDATE businesses SET points_per_visit = '1' WHERE points_per_visit IS NULL`));
  }

  const memCols = db.prepare("PRAGMA table_info(members)").all().map((c) => c.name);
  if (!memCols.includes("last_visit_at")) {
    db.exec("ALTER TABLE members ADD COLUMN last_visit_at TEXT");
  }

  const bizColsLoc = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  for (const col of ["location_lat", "location_lng", "location_relevant_text", "location_radius_meters", "location_address"]) {
    if (!bizColsLoc.includes(col)) {
      const type = col === "location_radius_meters" ? "INTEGER" : col === "location_relevant_text" || col === "location_address" ? "TEXT" : "REAL";
      db.exec(`ALTER TABLE businesses ADD COLUMN ${col} ${type}`);
    }
  }

  const bizColsUser = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsUser.includes("user_id")) {
    db.exec("ALTER TABLE businesses ADD COLUMN user_id TEXT REFERENCES users(id)");
    safeRun(db, () => db.exec("CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id)"));
  }

  const bizColsStamps = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsStamps.includes("required_stamps")) {
    db.exec("ALTER TABLE businesses ADD COLUMN required_stamps INTEGER");
  }
  const bizColsAfter = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsAfter.includes("stamp_emoji")) {
    db.exec("ALTER TABLE businesses ADD COLUMN stamp_emoji TEXT");
  }
  if (!bizColsAfter.includes("stamp_icon_base64")) {
    db.exec("ALTER TABLE businesses ADD COLUMN stamp_icon_base64 TEXT");
  }
  const bizColsBg = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsBg.includes("card_background_base64")) {
    db.exec("ALTER TABLE businesses ADD COLUMN card_background_base64 TEXT");
  }
  const bizColsLogoIcon = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsLogoIcon.includes("logo_icon_base64")) {
    db.exec("ALTER TABLE businesses ADD COLUMN logo_icon_base64 TEXT");
  }
  if (!bizColsLogoIcon.includes("logo_icon_updated_at")) {
    db.exec("ALTER TABLE businesses ADD COLUMN logo_icon_updated_at TEXT");
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
  safeRun(db, () => {
    db.exec("UPDATE businesses SET loyalty_mode = 'points_cash' WHERE loyalty_mode IS NULL OR TRIM(loyalty_mode) = ''");
    db.exec("UPDATE businesses SET points_per_ticket = 10 WHERE points_per_ticket IS NULL OR points_per_ticket <= 0");
  });

  const bizColsStampMid = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsStampMid.includes("stamp_mid_reward_label")) {
    db.exec("ALTER TABLE businesses ADD COLUMN stamp_mid_reward_label TEXT");
  }

  function ensureDemoBusiness() {
    let b = db.prepare("SELECT * FROM businesses WHERE slug = ?").get("demo");
    if (!b) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, "Demo Fast-Food", "demo", "Demo Fast-Food", "1 point = 1 € de réduction. Valable en magasin.", "contact@example.com");
      b = db.prepare("SELECT * FROM businesses WHERE slug = ?").get("demo");
    }
    return b;
  }
  const defaultBiz = ensureDemoBusiness();
  db.prepare("UPDATE members SET business_id = ? WHERE business_id IS NULL").run(defaultBiz.id);
  safeRun(db, () => db.exec("CREATE INDEX IF NOT EXISTS idx_members_business ON members(business_id)"));

  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'").get();
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

  const bizColsEng = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsEng.includes("engagement_rewards")) {
    db.exec("ALTER TABLE businesses ADD COLUMN engagement_rewards TEXT");
  }
  safeRun(db, () => {
    db.prepare(
      `UPDATE businesses SET points_reward_tiers = ?, engagement_rewards = ?
       WHERE LOWER(TRIM(slug)) = 'demo'`,
    ).run(DEMO_POINTS_REWARD_TIERS_JSON, DEMO_ENGAGEMENT_REWARDS_JSON);
  });
  safeRun(db, () => db.exec(`
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
  `));
  safeRun(db, () => db.exec(`
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
  `));
  const roulette = db.prepare("SELECT id FROM games WHERE code = ?").get("roulette");
  if (!roulette) {
    const gameId = randomUUID();
    db.prepare(
      "INSERT INTO games (id, code, name, type, active, config_json, created_at) VALUES (?, 'roulette', 'Roulette FidPass', 'roulette', 1, ?, datetime('now'))"
    ).run(gameId, JSON.stringify({ display_name: "Roulette", min_client_version: 1 }));
  }
  safeRun(db, () => {
    const demoRow = db.prepare("SELECT id FROM businesses WHERE LOWER(TRIM(slug)) = 'demo' LIMIT 1").get();
    const gameRow = db.prepare("SELECT id FROM games WHERE code = 'roulette' AND active = 1 LIMIT 1").get();
    if (!demoRow || !gameRow) return;
    const existing = db
      .prepare("SELECT id FROM business_games WHERE business_id = ? AND game_id = ? LIMIT 1")
      .get(demoRow.id, gameRow.id);
    const profile = JSON.stringify({ profile: "default" });
    if (!existing) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO business_games (id, business_id, game_id, enabled, ticket_cost, daily_spin_limit, cooldown_seconds, weight_profile_json, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, 100, 0, ?, datetime('now'), datetime('now'))`
      ).run(id, demoRow.id, gameRow.id, profile);
    } else {
      db.prepare(
        `UPDATE business_games SET enabled = 1, cooldown_seconds = 0, daily_spin_limit = 100, updated_at = datetime('now')
         WHERE business_id = ? AND game_id = ?`
      ).run(demoRow.id, gameRow.id);
    }
  });
  const cols = db.prepare("PRAGMA table_info(engagement_completions)").all().map((c) => c.name);
  if (!cols.includes("proof_id")) db.exec("ALTER TABLE engagement_completions ADD COLUMN proof_id TEXT");
  if (!cols.includes("proof_score")) db.exec("ALTER TABLE engagement_completions ADD COLUMN proof_score REAL");
  safeRun(db, () => db.exec(`
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
  `));

  const bizColsFinal = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (bizColsFinal.includes("dashboard_token")) {
    const needToken = db.prepare("SELECT id FROM businesses WHERE dashboard_token IS NULL OR dashboard_token = ''").all();
    for (const row of needToken) {
      const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
      db.prepare("UPDATE businesses SET dashboard_token = ? WHERE id = ?").run(token, row.id);
    }
  }
  if (!bizColsFinal.includes("last_broadcast_message")) {
    safeRun(db, () => db.prepare("ALTER TABLE businesses ADD COLUMN last_broadcast_message TEXT").run());
  }
  if (!bizColsFinal.includes("last_broadcast_at")) {
    safeRun(db, () => db.prepare("ALTER TABLE businesses ADD COLUMN last_broadcast_at TEXT").run());
  }
  if (!bizColsFinal.includes("notification_title_override")) {
    safeRun(db, () => db.prepare("ALTER TABLE businesses ADD COLUMN notification_title_override TEXT").run());
  }
  if (!bizColsFinal.includes("notification_change_message")) {
    safeRun(db, () => db.prepare("ALTER TABLE businesses ADD COLUMN notification_change_message TEXT").run());
  }
  const bizColsBroadcastSeq = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsBroadcastSeq.includes("broadcast_send_seq")) {
    safeRun(db, () =>
      db.prepare("ALTER TABLE businesses ADD COLUMN broadcast_send_seq INTEGER NOT NULL DEFAULT 0").run()
    );
  }
  const bizColsWalletLoc = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsWalletLoc.includes("wallet_pass_include_locations")) {
    // 0 = ne pas embarquer les coordonnées dans le .pkpass → campagnes notification visibles partout (comportement iOS).
    // 1 = embarquer (écran de verrouillage / pertinence près du magasin, peut réduire la visibilité des alertes hors zone).
    safeRun(db, () =>
      db.prepare("ALTER TABLE businesses ADD COLUMN wallet_pass_include_locations INTEGER NOT NULL DEFAULT 0").run()
    );
  }
  safeRun(db, () => db.exec(`
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
  `));

  const memColsProfile = db.prepare("PRAGMA table_info(members)").all().map((c) => c.name);
  for (const { col, type } of [
    { col: "phone", type: "TEXT" },
    { col: "city", type: "TEXT" },
    { col: "birth_date", type: "TEXT" },
    { col: "profile_ticket_bonus_granted", type: "INTEGER" },
  ]) {
    if (!memColsProfile.includes(col)) {
      safeRun(db, () => db.exec(`ALTER TABLE members ADD COLUMN ${col} ${type}`));
    }
  }

  const bizFlyerCols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFlyerCols.includes("flyer_prefs_json")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN flyer_prefs_json TEXT"));
  }
  const bizFlyerCols2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFlyerCols2.includes("flyer_prefs_updated_at")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN flyer_prefs_updated_at TEXT"));
  }

  const businessAssetsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_assets'").get();
  if (!businessAssetsTable) {
    const bizBeforeAssets = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
    if (!bizBeforeAssets.includes("card_background_updated_at")) {
      safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN card_background_updated_at TEXT"));
    }
    safeRun(db, () => {
      db.exec(`
        CREATE TABLE business_assets (
          business_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (business_id, kind),
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_business_assets_business_id ON business_assets(business_id);
      `);
    });
    const flagPairs = [
      ["asset_logo_present", "INTEGER NOT NULL DEFAULT 0"],
      ["asset_logo_icon_present", "INTEGER NOT NULL DEFAULT 0"],
      ["asset_card_background_present", "INTEGER NOT NULL DEFAULT 0"],
      ["asset_stamp_icon_present", "INTEGER NOT NULL DEFAULT 0"],
    ];
    for (const [col, colType] of flagPairs) {
      const cols = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
      if (!cols.includes(col)) {
        safeRun(db, () => db.exec(`ALTER TABLE businesses ADD COLUMN ${col} ${colType}`));
      }
    }
    const blobRows = db
      .prepare(
        "SELECT id, logo_base64, logo_icon_base64, card_background_base64, stamp_icon_base64 FROM businesses",
      )
      .all();
    const ins = db.prepare("INSERT OR REPLACE INTO business_assets (business_id, kind, data) VALUES (?, ?, ?)");
    for (const row of blobRows) {
      if (row.logo_base64 && String(row.logo_base64).trim()) ins.run(row.id, "logo", String(row.logo_base64));
      if (row.logo_icon_base64 && String(row.logo_icon_base64).trim())
        ins.run(row.id, "logo_icon", String(row.logo_icon_base64));
      if (row.card_background_base64 && String(row.card_background_base64).trim())
        ins.run(row.id, "card_background", String(row.card_background_base64));
      if (row.stamp_icon_base64 && String(row.stamp_icon_base64).trim())
        ins.run(row.id, "stamp_icon", String(row.stamp_icon_base64));
    }
    db.prepare(
      "UPDATE businesses SET logo_base64 = NULL, logo_icon_base64 = NULL, card_background_base64 = NULL, stamp_icon_base64 = NULL",
    ).run();
    db.exec(`UPDATE businesses SET asset_logo_present = 0, asset_logo_icon_present = 0, asset_card_background_present = 0, asset_stamp_icon_present = 0`);
    db.exec(`UPDATE businesses SET asset_logo_present = 1 WHERE id IN (SELECT business_id FROM business_assets WHERE kind = 'logo')`);
    db.exec(`UPDATE businesses SET asset_logo_icon_present = 1 WHERE id IN (SELECT business_id FROM business_assets WHERE kind = 'logo_icon')`);
    db.exec(
      `UPDATE businesses SET asset_card_background_present = 1 WHERE id IN (SELECT business_id FROM business_assets WHERE kind = 'card_background')`,
    );
    db.exec(`UPDATE businesses SET asset_stamp_icon_present = 1 WHERE id IN (SELECT business_id FROM business_assets WHERE kind = 'stamp_icon')`);
    safeRun(db, () =>
      db.exec(
        `UPDATE businesses SET card_background_updated_at = COALESCE(logo_updated_at, datetime('now')) WHERE asset_card_background_present = 1`,
      ),
    );
  }

  const bizColsBgUpd = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsBgUpd.includes("card_background_updated_at")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN card_background_updated_at TEXT"));
  }

  const bizColsNotifIcon = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsNotifIcon.includes("asset_notification_icon_present")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN asset_notification_icon_present INTEGER NOT NULL DEFAULT 0"),
    );
  }
  const bizColsNotifIcon2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsNotifIcon2.includes("notification_icon_updated_at")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN notification_icon_updated_at TEXT"));
  }

  const bizColsPassLayout = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizColsPassLayout.includes("notification_pass_layout_at")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN notification_pass_layout_at TEXT"));
  }

  // ── v2 : Idempotency sur transactions + indexes performance ──────────────
  markMigrationApplied(db, 2, "transaction_idempotency_and_performance_indexes");
  // ── Idempotency sur transactions (points_add, reward_redeem) ──────────────
  // Permet de détecter un double-envoi (double-clic, retry réseau) et de retourner
  // le résultat déjà calculé sans créditer les points une deuxième fois.
  const txCols = db.prepare("PRAGMA table_info(transactions)").all().map((c) => c.name);
  if (!txCols.includes("idempotency_key")) {
    safeRun(db, () => db.exec("ALTER TABLE transactions ADD COLUMN idempotency_key TEXT"));
    safeRun(db, () => db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_business_idempotency ON transactions(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL"
    ));
  }

  // ── Indexes composites manquants pour performance analytics ──────────────
  // Dashboard stats : transactions des 30 derniers jours par business
  safeRun(db, () => db.exec(
    "CREATE INDEX IF NOT EXISTS idx_transactions_business_created ON transactions(business_id, created_at DESC)"
  ));
  // Recherche membre par email dans un business (getMemberByEmailForBusiness)
  safeRun(db, () => db.exec(
    "CREATE INDEX IF NOT EXISTS idx_members_business_email ON members(business_id, email)"
  ));
  // Pass registrations : retrouver le push_token rapidement
  safeRun(db, () => db.exec(
    "CREATE INDEX IF NOT EXISTS idx_pass_reg_push_token ON pass_registrations(push_token) WHERE push_token IS NOT NULL"
  ));
  // Engagement completions par business + statut (file de validation)
  safeRun(db, () => db.exec(
    "CREATE INDEX IF NOT EXISTS idx_engagement_completions_business_status ON engagement_completions(business_id, status, created_at DESC)"
  ));

  // ── v3 : Refresh tokens (JWT + refresh avec rotation ; durées configurables côté auth.js) ─────────
  markMigrationApplied(db, 3, "refresh_tokens_table");
  safeRun(db, () => db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `));
  safeRun(db, () => db.exec(
    "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)"
  ));

  // Anciennes BDD : refresh_tokens.user_id était INTEGER → UUID stocké comme 0, refresh cassait tous les JWT.
  const rtLegacy = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'").get();
  if (rtLegacy) {
    const uidCol = db.prepare("PRAGMA table_info(refresh_tokens)").all().find((c) => c.name === "user_id");
    if (uidCol && /INTEGER/i.test(String(uidCol.type || ""))) {
      markMigrationApplied(db, 8, "refresh_tokens_user_id_text");
      safeRun(db, () => {
        db.exec("ALTER TABLE refresh_tokens RENAME TO refresh_tokens_int_legacy");
        db.exec(`
          CREATE TABLE refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);
        db.exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)");
        db.exec("DROP TABLE refresh_tokens_int_legacy");
      });
    }
  }

  const bizCamp = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizCamp.includes("campaign_automation_json")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN campaign_automation_json TEXT"));
  }

  // ── v4 : refonte notifications (batches, logs enrichis, multi-appareils commerçant) ──
  markMigrationApplied(db, 4, "notification_refactor_batches_and_merchant_devices");
  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS notification_batches (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      trigger_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );
    CREATE INDEX IF NOT EXISTS idx_notification_batches_business_created ON notification_batches(business_id, created_at DESC);
  `)
  );

  let nlCols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  if (!nlCols.includes("batch_id")) {
    safeRun(db, () => db.exec("ALTER TABLE notification_log ADD COLUMN batch_id TEXT"));
    nlCols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  }
  if (!nlCols.includes("channel")) {
    safeRun(db, () => db.exec("ALTER TABLE notification_log ADD COLUMN channel TEXT"));
    nlCols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  }
  if (!nlCols.includes("trigger_name")) {
    safeRun(db, () => db.exec("ALTER TABLE notification_log ADD COLUMN trigger_name TEXT"));
    nlCols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  }
  if (!nlCols.includes("counts_for_member_cooldown")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE notification_log ADD COLUMN counts_for_member_cooldown INTEGER NOT NULL DEFAULT 1")
    );
    nlCols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  }
  if (!nlCols.includes("status")) {
    safeRun(db, () => db.exec("ALTER TABLE notification_log ADD COLUMN status TEXT DEFAULT 'sent'"));
    nlCols = db.prepare("PRAGMA table_info(notification_log)").all().map((c) => c.name);
  }
  if (!nlCols.includes("error_detail")) {
    safeRun(db, () => db.exec("ALTER TABLE notification_log ADD COLUMN error_detail TEXT"));
  }
  safeRun(db, () =>
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_notification_log_cooldown ON notification_log(business_id, member_id, created_at) WHERE counts_for_member_cooldown = 1 AND member_id IS NOT NULL"
    )
  );

  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS merchant_push_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL UNIQUE,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_push_devices_user ON merchant_push_devices(user_id);
  `)
  );

  const migratedDevices = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_device_tokens'")
    .get();
  if (migratedDevices) {
    const oldRows = db.prepare("SELECT user_id, device_token, updated_at FROM merchant_device_tokens").all();
    const ins = db.prepare(
      `INSERT OR IGNORE INTO merchant_push_devices (id, user_id, device_token, updated_at) VALUES (?, ?, ?, ?)`
    );
    for (const row of oldRows) {
      if (!row.user_id || !row.device_token) continue;
      ins.run(randomUUID(), row.user_id, String(row.device_token).trim(), row.updated_at || new Date().toISOString());
    }
  }

  // ── v5 : quota générations flyer IA (3 gratuites / commerce, lifetime) ─────
  markMigrationApplied(db, 5, "flyer_ai_generations_quota");
  const bizFlyerAi = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFlyerAi.includes("flyer_ai_generations_used")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN flyer_ai_generations_used INTEGER NOT NULL DEFAULT 0"),
    );
  }

  // ── v6 : quota mensuel + mode illimité (test équipe) ────────────────────────
  markMigrationApplied(db, 6, "flyer_ai_monthly_quota_and_unlimited");
  const bizFlyerAi6 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFlyerAi6.includes("flyer_ai_billing_month")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN flyer_ai_billing_month TEXT"));
  }
  const bizFlyerAi62 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFlyerAi62.includes("flyer_ai_unlimited")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN flyer_ai_unlimited INTEGER NOT NULL DEFAULT 0"),
    );
  }

  // ── v7 : campaign event jobs (envoi différé “évènement -> +délai”) ─────────
  markMigrationApplied(db, 7, "campaign_event_jobs_table");
  safeRun(db, () =>
    db.exec(`
      CREATE TABLE IF NOT EXISTS campaign_event_jobs (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        event_rule_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        run_at TEXT NOT NULL,
        title TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        processing_at TEXT,
        processed_at TEXT,
        last_error TEXT,
        UNIQUE(business_id, member_id, event_rule_id)
      );
      CREATE INDEX IF NOT EXISTS idx_campaign_event_jobs_status_runat ON campaign_event_jobs(status, run_at);
      CREATE INDEX IF NOT EXISTS idx_campaign_event_jobs_business_runat ON campaign_event_jobs(business_id, run_at);
    `)
  );

  // ── v9 : plafonds scan / caisse (passages/jour, points par transaction) ───
  markMigrationApplied(db, 9, "scan_security_limits_per_member");
  const bizScan = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizScan.includes("scan_max_passes_per_member_per_day")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN scan_max_passes_per_member_per_day INTEGER"),
    );
  }
  const bizScan2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizScan2.includes("scan_max_points_per_transaction")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN scan_max_points_per_transaction INTEGER"),
    );
  }

  // ── v10 : validation ticket de caisse (QR JWT) ───────────────────────────
  markMigrationApplied(db, 10, "receipt_qr_validation");
  const bizRcp = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRcp.includes("require_receipt_qr_validation")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN require_receipt_qr_validation INTEGER NOT NULL DEFAULT 0"),
    );
  }
  const bizRcp2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRcp2.includes("receipt_qr_tolerance_cents")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN receipt_qr_tolerance_cents INTEGER NOT NULL DEFAULT 5"),
    );
  }

  // ── v11 : générations flyer achetées (bonus persistant, s’ajoute aux 3 / mois) + idempotence Stripe ─
  markMigrationApplied(db, 11, "flyer_ai_bonus_and_stripe_webhook_events");
  const bizBonus = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizBonus.includes("flyer_ai_generations_bonus")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN flyer_ai_generations_bonus INTEGER NOT NULL DEFAULT 0"),
    );
  }
  safeRun(db, () =>
    db.exec(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `),
  );

  // ── v12 : fond d’écran page fidélité web (/fidelity/:slug) ─────────────────
  markMigrationApplied(db, 12, "fidelity_page_background_asset");
  const bizFidBg = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFidBg.includes("asset_fidelity_page_background_present")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN asset_fidelity_page_background_present INTEGER NOT NULL DEFAULT 0"),
    );
  }
  const bizFidBg2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFidBg2.includes("fidelity_page_background_updated_at")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN fidelity_page_background_updated_at TEXT"));
  }
  safeRun(db, () =>
    db.exec(
      `UPDATE businesses SET asset_fidelity_page_background_present = 1 WHERE id IN (SELECT business_id FROM business_assets WHERE kind = 'fidelity_page_background')`,
    ),
  );

  // ── v13 : titre personnalisable page jeu QR (/fidelity/:slug, parcours invité) ─
  markMigrationApplied(db, 13, "fidelity_qr_hero_title");
  const bizFidTitle = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizFidTitle.includes("fidelity_qr_hero_title")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN fidelity_qr_hero_title TEXT"));
  }

  // ── v14 : file de travaux persistante pour les campagnes de notifications ──
  // Garantit qu'un crash entre le 202 Accepted et l'exécution de setImmediate
  // ne perd pas la campagne — le worker reprend les jobs 'pending'/'running' orphelins.
  markMigrationApplied(db, 14, "notification_jobs_persistent_queue");
  safeRun(db, () => db.exec(`
    CREATE TABLE IF NOT EXISTS notification_jobs (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      api_base TEXT NOT NULL,
      member_ids TEXT,
      title TEXT,
      body TEXT NOT NULL,
      trigger_name TEXT NOT NULL DEFAULT 'campaign_manual',
      merchant_user_id TEXT,
      touch_member_last_visit INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      batch_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notif_jobs_status_created
      ON notification_jobs(status, created_at);
  `));

  // ── v15 : génération flyer IA asynchrone (202 + job_id, reprise après crash / worker) ──
  markMigrationApplied(db, 15, "flyer_generation_jobs_async");
  safeRun(db, () =>
    db.exec(`
      CREATE TABLE IF NOT EXISTS flyer_generation_jobs (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        body_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        dev_bypass_quota INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_flyer_jobs_business_status
        ON flyer_generation_jobs(business_id, status);
      CREATE INDEX IF NOT EXISTS idx_flyer_jobs_status_created
        ON flyer_generation_jobs(status, created_at);
    `),
  );

  // ── v16 : comptes administrateur plateforme + journal événements (paiements, etc.) ─
  markMigrationApplied(db, 16, "platform_admin_users_and_events");
  const userColsAdmin = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!userColsAdmin.includes("is_admin")) {
    safeRun(db, () => db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"));
  }
  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS admin_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      stripe_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_events_created ON admin_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_events_stripe ON admin_events(stripe_event_id);
  `),
  );

  // ── v17 : drapeaux runtime (bootstrap mot de passe admin, etc.) ─
  markMigrationApplied(db, 17, "app_runtime_flags");
  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS app_runtime_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `),
  );

  // Horodatage monotonique ms pour PassKit : Last-Modified HTTP n'a que la seconde — évite que
  // deux changements (ex. icône notif) dans la même seconde ne fassent pas refetch le .pkpass.
  const bizPassMs = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizPassMs.includes("pass_last_modified_ms")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN pass_last_modified_ms INTEGER"));
    safeRun(db, () =>
      db.exec(
        `UPDATE businesses SET pass_last_modified_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE pass_last_modified_ms IS NULL`,
      ),
    );
  }

  // ── v18 : historique métriques avis & réseaux (deltas, graphiques) ──
  markMigrationApplied(db, 18, "social_metric_snapshots");
  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS social_metric_snapshots (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      source TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_social_metrics_business_channel_time
      ON social_metric_snapshots(business_id, channel, captured_at DESC);
  `),
  );

  // ── v19 : connexions OAuth réseaux (Meta / Instagram, futurs fournisseurs) ──
  markMigrationApplied(db, 19, "social_oauth_connections");
  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS social_oauth_connections (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at TEXT,
      external_user_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_oauth_business_provider
      ON social_oauth_connections(business_id, provider);
  `),
  );

  // ── v20 : réclamations points livraison (ticket plateforme + IA + anti-doublon) ─
  markMigrationApplied(db, 20, "receipt_delivery_claims");
  safeRun(db, () =>
    db.exec(`
 CREATE TABLE IF NOT EXISTS receipt_delivery_claims (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      file_hash_sha256 TEXT NOT NULL,
      claim_fingerprint TEXT NOT NULL,
      amount_eur REAL NOT NULL,
      points_credited INTEGER,
      ai_extracted_json TEXT,
      ai_confidence REAL,
      merchant_match_ok INTEGER,
      rejection_reason TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolution_note TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rdc_business_status_created
      ON receipt_delivery_claims(business_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rdc_business_member_created
      ON receipt_delivery_claims(business_id, member_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rdc_business_filehash
      ON receipt_delivery_claims(business_id, file_hash_sha256);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rdc_idempotency
      ON receipt_delivery_claims(business_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL AND trim(idempotency_key) != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rdc_business_fp_active
      ON receipt_delivery_claims(business_id, claim_fingerprint)
      WHERE status IN ('pending', 'approved');
  `),
  );
  const bizRdc = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRdc.includes("delivery_receipt_claims_enabled")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN delivery_receipt_claims_enabled INTEGER NOT NULL DEFAULT 1"),
    );
  }
  const bizRdc2 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRdc2.includes("delivery_receipt_max_age_days")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN delivery_receipt_max_age_days INTEGER NOT NULL DEFAULT 14"),
    );
  }
  const bizRdc3 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRdc3.includes("delivery_receipt_auto_max_amount_eur")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN delivery_receipt_auto_max_amount_eur REAL NOT NULL DEFAULT 80"),
    );
  }
  const bizRdc4 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRdc4.includes("delivery_receipt_auto_min_confidence")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN delivery_receipt_auto_min_confidence REAL NOT NULL DEFAULT 0.72"),
    );
  }
  const bizRdc5 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRdc5.includes("delivery_receipt_max_per_member_per_day")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN delivery_receipt_max_per_member_per_day INTEGER NOT NULL DEFAULT 4"),
    );
  }
  const bizRdc6 = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizRdc6.includes("delivery_receipt_max_per_member_per_month")) {
    safeRun(db, () =>
      db.exec("ALTER TABLE businesses ADD COLUMN delivery_receipt_max_per_member_per_month INTEGER NOT NULL DEFAULT 25"),
    );
  }

  // ── v21 : tampons explicites en base pour les commerces qui avaient required_stamps > 0 sans program_type
  // (évite de basculer ces comptes en « points » après passage au défaut program_type = points).
  const m21 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 21").get();
  if (!m21) {
    safeRun(db, () =>
      db.exec(`
        UPDATE businesses SET program_type = 'stamps'
        WHERE (program_type IS NULL OR TRIM(program_type) = '')
          AND required_stamps IS NOT NULL AND required_stamps > 0
      `),
    );
    markMigrationApplied(db, 21, "program_type_backfill_from_required_stamps");
  }

  // ── v22 : index de performance pour les requêtes de segmentation campagne ──
  // Les requêtes getMemberIdsBySegment filtrent systématiquement sur (business_id, last_visit_at),
  // (business_id, created_at), et (business_id, points). Sans ces index composites, SQLite fait
  // un full scan de la table members à chaque exécution du cron automatisation (toutes les 24 h).
  safeRun(db, () =>
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_members_business_last_visit ON members(business_id, last_visit_at)",
    ),
  );
  safeRun(db, () =>
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_members_business_created ON members(business_id, created_at)",
    ),
  );
  safeRun(db, () =>
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_members_business_points ON members(business_id, points)",
    ),
  );
  safeRun(db, () =>
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_notification_log_business_member_created ON notification_log(business_id, member_id, created_at DESC)",
    ),
  );

  // ── v23 : authentification par téléphone (OTP SMS) ──
  markMigrationApplied(db, 23, "phone_auth_otp");
  const userColsPhone = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!userColsPhone.includes("phone_e164")) {
    safeRun(db, () => db.exec("ALTER TABLE users ADD COLUMN phone_e164 TEXT"));
  }
  safeRun(db, () =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS phone_otp_challenges (
      phone_e164 TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `),
  );
  safeRun(db, () =>
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164 ON users(phone_e164) WHERE phone_e164 IS NOT NULL"),
  );

  // ── v24 : Google Business Profile — avis individuels, posts, Q&A, insights cache ──
  const m24 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 24").get();
  if (!m24) {
    safeRun(db, () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_business_reviews (
          review_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          location_name TEXT,
          rating INTEGER NOT NULL DEFAULT 0,
          author_name TEXT,
          author_photo_url TEXT,
          comment TEXT,
          reply_comment TEXT,
          reply_update_time TEXT,
          create_time TEXT,
          update_time TEXT,
          first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
          notified_at TEXT,
          starred INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          seen_by_merchant_at TEXT,
          raw_json TEXT,
          PRIMARY KEY (business_id, review_id),
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
      `),
    );
    safeRun(db, () =>
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_gbp_reviews_business_update ON google_business_reviews(business_id, update_time DESC)",
      ),
    );
    safeRun(db, () =>
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_gbp_reviews_business_unreplied ON google_business_reviews(business_id) WHERE reply_comment IS NULL OR trim(reply_comment) = ''",
      ),
    );

    safeRun(db, () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_business_posts (
          post_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          name TEXT,
          topic_type TEXT,
          summary TEXT,
          language_code TEXT,
          media_url TEXT,
          cta_type TEXT,
          cta_url TEXT,
          event_title TEXT,
          event_start TEXT,
          event_end TEXT,
          offer_coupon TEXT,
          offer_redeem_online_url TEXT,
          offer_terms TEXT,
          state TEXT,
          create_time TEXT,
          update_time TEXT,
          search_url TEXT,
          raw_json TEXT,
          PRIMARY KEY (business_id, post_id),
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
      `),
    );
    safeRun(db, () =>
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_gbp_posts_business_update ON google_business_posts(business_id, update_time DESC)",
      ),
    );

    safeRun(db, () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_business_questions (
          question_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          name TEXT,
          text TEXT,
          author_name TEXT,
          author_photo_url TEXT,
          author_is_owner INTEGER NOT NULL DEFAULT 0,
          upvote_count INTEGER NOT NULL DEFAULT 0,
          total_answer_count INTEGER NOT NULL DEFAULT 0,
          top_answer_text TEXT,
          top_answer_author TEXT,
          top_answer_update_time TEXT,
          create_time TEXT,
          update_time TEXT,
          answered_by_owner INTEGER NOT NULL DEFAULT 0,
          raw_json TEXT,
          PRIMARY KEY (business_id, question_id),
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
      `),
    );
    safeRun(db, () =>
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_gbp_questions_business_update ON google_business_questions(business_id, update_time DESC)",
      ),
    );

    safeRun(db, () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_business_insights_cache (
          business_id TEXT PRIMARY KEY,
          cached_at TEXT NOT NULL DEFAULT (datetime('now')),
          payload_json TEXT NOT NULL,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
      `),
    );

    safeRun(db, () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_business_location_cache (
          business_id TEXT PRIMARY KEY,
          cached_at TEXT NOT NULL DEFAULT (datetime('now')),
          payload_json TEXT NOT NULL,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
      `),
    );

    safeRun(db, () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_business_media (
          media_id TEXT NOT NULL,
          business_id TEXT NOT NULL,
          name TEXT,
          media_format TEXT,
          category TEXT,
          google_url TEXT,
          thumbnail_url TEXT,
          create_time TEXT,
          raw_json TEXT,
          PRIMARY KEY (business_id, media_id),
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        );
      `),
    );

    markMigrationApplied(db, 24, "google_business_reviews_posts_questions_insights");
  }

  const m25 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 25").get();
  if (!m25) {
    const bizB = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
    if (!bizB.includes("baseline_avg_basket_eur")) {
      safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN baseline_avg_basket_eur REAL"));
    }
    markMigrationApplied(db, 25, "merchant_baseline_avg_basket_eur");
  }

  // ── v26 : suppression du palier +10 pts (roulette + tiers programme) ──
  // La récompense p10 était trop facile à déclencher au 1er spin et affichait "+10 points"
  // dans le popup de gain QR, donnant l'impression d'un cadeau automatique à l'inscription.
  const m26 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 26").get();
  if (!m26) {
    safeRun(db, () =>
      db.exec("UPDATE game_rewards SET active = 0, weight = 0 WHERE code = 'p10'"),
    );
    safeRun(db, () => {
      const businesses = db.prepare("SELECT id, points_reward_tiers FROM businesses WHERE points_reward_tiers IS NOT NULL AND TRIM(points_reward_tiers) != ''").all();
      const stmt = db.prepare("UPDATE businesses SET points_reward_tiers = ? WHERE id = ?");
      for (const biz of businesses) {
        try {
          const tiers = JSON.parse(biz.points_reward_tiers);
          if (!Array.isArray(tiers)) continue;
          const filtered = tiers.filter((t) => Number(t.points) !== 10);
          if (filtered.length !== tiers.length) {
            stmt.run(JSON.stringify(filtered), biz.id);
          }
        } catch (_) {}
      }
    });
    markMigrationApplied(db, 26, "remove_p10_roulette_reward_and_tier");
  }

  // ── v27 : supprime définitivement la ligne p10 + recalibre les poids p25/p50 ──
  // v26 ne faisait que désactiver p10 (visible dans le dashboard) et laissait p25/p50 avec
  // leurs anciens poids (8/2) qui faussaient la distribution réelle (86%/11%/3% au lieu de 65%/28%/7%).
  const m27 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 27").get();
  if (!m27) {
    safeRun(db, () =>
      db.exec("DELETE FROM game_rewards WHERE code = 'p10'"),
    );
    safeRun(db, () =>
      db.exec("UPDATE game_rewards SET weight = 28 WHERE code = 'p25' AND weight = 8"),
    );
    safeRun(db, () =>
      db.exec("UPDATE game_rewards SET weight = 7 WHERE code = 'p50' AND weight = 2"),
    );
    markMigrationApplied(db, 27, "delete_p10_recalibrate_p25_p50_weights");
  }

  // ── v28 : roue cadeau direct — remplace p25/p50/s1/s2 par un unique reward "cadeau" de kind="gift" ──
  // La roue ne donne plus de points/tampons directement : elle débloque la récompense configurée
  // par le commerçant dans sa carte (premier palier de points_reward_tiers ou label personnalisé).
  const m28 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 28").get();
  if (!m28) {
    safeRun(db, () => {
      const businesses = db.prepare("SELECT id, points_reward_tiers FROM businesses").all();
      for (const biz of businesses) {
        const gameRow = db.prepare(
          `SELECT bg.id as bg_id, bg.game_id FROM business_games bg
           INNER JOIN games g ON g.id = bg.game_id AND g.code = 'roulette'
           WHERE bg.business_id = ? LIMIT 1`
        ).get(biz.id);
        if (!gameRow) continue;

        /* Dérive le libellé cadeau depuis le premier palier de la carte du commerçant */
        let giftLabel = "Cadeau offert";
        try {
          const tiers = JSON.parse(biz.points_reward_tiers || "[]");
          if (Array.isArray(tiers) && tiers.length > 0 && tiers[0].label) {
            giftLabel = String(tiers[0].label).trim().slice(0, 120) || giftLabel;
          }
        } catch (_) {}

        /* Supprime les anciens rewards points/tampons (garde PERDU) */
        db.prepare(
          "DELETE FROM game_rewards WHERE business_id = ? AND game_id = ? AND kind IN ('points', 'stamps')"
        ).run(biz.id, gameRow.game_id);

        /* Supprime l'éventuel cadeau existant pour éviter les doublons */
        db.prepare(
          "DELETE FROM game_rewards WHERE business_id = ? AND game_id = ? AND code = 'cadeau'"
        ).run(biz.id, gameRow.game_id);

        /* Insère le reward cadeau unique */
        db.prepare(
          `INSERT INTO game_rewards
           (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
           VALUES (?, ?, ?, 'cadeau', ?, 'gift', NULL, NULL, 1, 35, datetime('now'))`
        ).run(randomUUID(), biz.id, gameRow.game_id, giftLabel);

        /* S'assure que PERDU existe avec le bon poids */
        const perdu = db.prepare(
          "SELECT id FROM game_rewards WHERE business_id = ? AND game_id = ? AND code = 'no_reward' LIMIT 1"
        ).get(biz.id, gameRow.game_id);
        if (perdu) {
          db.prepare(
            "UPDATE game_rewards SET weight = 65, active = 1 WHERE id = ?"
          ).run(perdu.id);
        } else {
          db.prepare(
            `INSERT INTO game_rewards
             (id, business_id, game_id, code, label, kind, value_json, stock, active, weight, created_at)
             VALUES (?, ?, ?, 'no_reward', 'PERDU', 'none', NULL, NULL, 1, 65, datetime('now'))`
          ).run(randomUUID(), biz.id, gameRow.game_id);
        }
      }
    });
    markMigrationApplied(db, 28, "roulette_gift_kind_replace_points_stamps");
  }

  const m29 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 29").get();
  if (!m29) {
    safeRun(db, () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS business_team_members (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'staff',
          status TEXT NOT NULL DEFAULT 'active',
          invited_by TEXT REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_business_team_business_user ON business_team_members(business_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_business_team_business ON business_team_members(business_id);
        CREATE INDEX IF NOT EXISTS idx_business_team_user ON business_team_members(user_id);
      `);
    });
    markMigrationApplied(db, 29, "business_team_members");
  }

  const m30 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 30").get();
  if (!m30) {
    const userColsStaff = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
    if (!userColsStaff.includes("staff_login")) {
      safeRun(db, () => db.exec("ALTER TABLE users ADD COLUMN staff_login TEXT"));
    }
    safeRun(db, () =>
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_login ON users(staff_login) WHERE staff_login IS NOT NULL",
      ),
    );
    markMigrationApplied(db, 30, "users_staff_login");
  }

  const m31 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 31").get();
  if (!m31) {
    // `staff_login` peut être partagé entre commerces ; unicité retirée (login départagé par mot de passe).
    safeRun(db, () => db.exec("DROP INDEX IF EXISTS idx_users_staff_login"));
    safeRun(db, () =>
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_users_staff_login_lookup ON users(lower(staff_login)) WHERE staff_login IS NOT NULL",
      ),
    );
    markMigrationApplied(db, 31, "users_staff_login_non_unique");
  }

  // ── v32 : acteur caisse (compte employé) sur les transactions — stats équipe / scans ──
  const m32 = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 32").get();
  if (!m32) {
    const txC = db.prepare("PRAGMA table_info(transactions)").all().map((c) => c.name);
    if (!txC.includes("actor_user_id")) {
      safeRun(db, () => db.exec("ALTER TABLE transactions ADD COLUMN actor_user_id TEXT"));
      safeRun(
        db,
        () => db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tx_business_actor ON transactions(business_id, actor_user_id) WHERE actor_user_id IS NOT NULL",
        ),
      );
    }
    markMigrationApplied(db, 32, "transactions_actor_user_caisse");
  }

  const bizAccPrefs = db.prepare("PRAGMA table_info(businesses)").all().map((c) => c.name);
  if (!bizAccPrefs.includes("accounting_prefs_json")) {
    safeRun(db, () => db.exec("ALTER TABLE businesses ADD COLUMN accounting_prefs_json TEXT"));
  }
}
