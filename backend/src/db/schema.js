/**
 * Schéma SQLite initial (CREATE TABLE). Exécuté une fois au démarrage.
 * Référence : REFONTE-REGLES.md — db découpé par domaine.
 */
export function runSchema(db) {
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
}
