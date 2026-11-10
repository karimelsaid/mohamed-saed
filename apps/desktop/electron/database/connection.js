const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('../logging/logger');

class DatabaseConnection {
  constructor(dbPath = null) {
    this.customPath = dbPath;
    this.db = null;
  }

  resolveDatabasePath() {
    if (this.customPath) return this.customPath;
    if (process.env.SUIT_STORE_DB_PATH) return process.env.SUIT_STORE_DB_PATH;

    const baseDir = process.env.APPDATA || path.join(os.homedir(), '.suit-store');
    const dataDir = path.join(baseDir, 'SuitStore', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'suit-store.db');
  }

  connect() {
    if (this.db) return this.db;

    const dbPath = this.resolveDatabasePath();
    logger.info(`Opening SQLite Database at: ${dbPath}`);

    this.db = new DatabaseSync(dbPath);

    // Apply critical PRAGMAs
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA temp_store = MEMORY;');

    logger.info('SQLite PRAGMAs configured: foreign_keys=ON, journal_mode=WAL');
    return this.db;
  }

  getDb() {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }

  run(sql, params = []) {
    const stmt = this.getDb().prepare(sql);
    return stmt.run(...params);
  }

  get(sql, params = []) {
    const stmt = this.getDb().prepare(sql);
    return stmt.get(...params);
  }

  all(sql, params = []) {
    const stmt = this.getDb().prepare(sql);
    return stmt.all(...params);
  }

  exec(sql) {
    return this.getDb().exec(sql);
  }

  close() {
    if (this.db) {
      logger.info('Closing SQLite Database connection...');
      this.db.close();
      this.db = null;
    }
  }
}

const dbConnection = new DatabaseConnection();

module.exports = { dbConnection, DatabaseConnection };

