const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDirectory = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDirectory, 'tiffinflow.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
