const db = require('./db');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      monthly_plan_price INTEGER NOT NULL CHECK(monthly_plan_price > 0),
      subscription_start_date TEXT NOT NULL,
      subscription_cycle_id TEXT NOT NULL DEFAULT (lower(hex(randomblob(8)))),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PAUSED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pause_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      CHECK(start_date <= end_date),
      UNIQUE(customer_id, start_date, end_date)
    );

    CREATE TABLE IF NOT EXISTS notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      delivery_date TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'outbox',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      UNIQUE(customer_id, delivery_date, channel)
    );

    CREATE TABLE IF NOT EXISTS subscription_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_customer_id INTEGER NOT NULL,
      new_customer_id INTEGER NOT NULL,
      subscription_cycle_id TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      transfer_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (old_customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (new_customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      UNIQUE(old_customer_id, new_customer_id, effective_date),
      UNIQUE(subscription_cycle_id, effective_date)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
    CREATE INDEX IF NOT EXISTS idx_customers_cycle ON customers(subscription_cycle_id);
    CREATE INDEX IF NOT EXISTS idx_pause_customer ON pause_periods(customer_id);
    CREATE INDEX IF NOT EXISTS idx_pause_dates ON pause_periods(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_outbox_customer_date ON notification_outbox(customer_id, delivery_date);
    CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON notification_outbox(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transfer_old_customer ON subscription_transfers(old_customer_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_new_customer ON subscription_transfers(new_customer_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_cycle ON subscription_transfers(subscription_cycle_id, effective_date);
  `);
}

module.exports = { initDatabase };
