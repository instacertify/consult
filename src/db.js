const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'consult.db');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      meta_description TEXT DEFAULT '',
      canonical_path TEXT NOT NULL,
      robots TEXT DEFAULT 'index, follow',
      og_title TEXT DEFAULT '',
      og_description TEXT DEFAULT '',
      hero_h1 TEXT DEFAULT '',
      hero_lede TEXT DEFAULT '',
      form_heading TEXT DEFAULT '',
      whatsapp_text TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      role_options TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      hub_label TEXT DEFAULT '',
      hub_blurb TEXT DEFAULT '',
      hub_badge TEXT DEFAULT '',
      source_file TEXT NOT NULL,
      source_type TEXT DEFAULT 'seed',
      content_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_slug TEXT,
      name TEXT,
      email TEXT,
      country_code TEXT,
      phone TEXT,
      role TEXT,
      product TEXT,
      consent INTEGER DEFAULT 0,
      raw_json TEXT DEFAULT '{}',
      email_sent INTEGER DEFAULT 0,
      email_error TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT,
      stored_name TEXT,
      mime TEXT,
      size INTEGER,
      page_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE SET NULL
    );
  `);

  return db;
}

let _db;
function getDb() {
  if (!_db) _db = ensureDb();
  return _db;
}

function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  const stored = typeof value === 'string' ? value : JSON.stringify(value);
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, stored);
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

module.exports = {
  getDb,
  getSetting,
  setSetting,
  getAllSettings,
  DB_PATH,
};
