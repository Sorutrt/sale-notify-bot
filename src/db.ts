import { Database } from "bun:sqlite";

export type Db = Database;

export function initDb(pathOrDb: string | Database = "./sale-notify.db"): Database {
  const db = typeof pathOrDb === "string" ? new Database(pathOrDb) : pathOrDb;

  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      base_price INTEGER NOT NULL CHECK (base_price >= 0),
      threshold_percent REAL NOT NULL DEFAULT 10 CHECK (threshold_percent >= 0),
      last_price INTEGER,
      last_notified_price INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE (product_id, url)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_id) REFERENCES product_urls(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_urls_product_id
      ON product_urls(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_urls_enabled
      ON product_urls(enabled);
    CREATE INDEX IF NOT EXISTS idx_price_history_url_checked_at
      ON price_history(url_id, checked_at);
  `);

  return db;
}

export const createDatabase = initDb;
