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

export function runMigrations(db) {
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
}
