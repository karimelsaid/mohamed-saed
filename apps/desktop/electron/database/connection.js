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

    // Run schema migrations and seed base lookup data automatically on first connection
    this.ensureInitialized();

    return this.db;
  }

  ensureInitialized() {
    try {
      const { MigrationRunner } = require('./migration-runner');
      const runner = new MigrationRunner(this);
      runner.runPendingMigrations();
      this.seedDefaultsIfNeeded();
    } catch (err) {
      logger.error('CRITICAL: Failed to ensure database initialization:', { error: err.message, stack: err.stack });
    }
  }

  seedDefaultsIfNeeded() {
    try {
      const db = this.db;
      if (!db) return;

      // 1. Ensure default warehouse exists
      const whRow = db.prepare('SELECT COUNT(*) as count FROM warehouses').get();
      if (!whRow || whRow.count === 0) {
        db.prepare(`
          INSERT INTO warehouses (code, name, location, is_default, is_active)
          VALUES ('MAIN', 'المخزن الرئيسي', 'الفرع الرئيسي', 1, 1)
        `).run();
        logger.info('Seeded default warehouse: MAIN');
      }

      // 2. Ensure default owner account exists
      const ownerRow = db.prepare('SELECT COUNT(*) as count FROM owner_account').get();
      if (!ownerRow || ownerRow.count === 0) {
        db.prepare(`
          INSERT INTO owner_account (username, password_hash, pin_code, full_name, phone)
          VALUES ('admin', 'admin', '1234', 'محمد السعيد', '01000000000')
        `).run();
        logger.info('Seeded default owner account');
      }

      // 3. Ensure store profile settings exist
      const defaultStoreSettings = [
        ['store_storeName', 'محمد السعيد', 'Store Name'],
        ['store_phone', '01000000000', 'Store Phone'],
        ['store_address', 'القاهرة، مصر', 'Store Address'],
        ['store_currency', 'EGP', 'Currency'],
        ['store_invoiceFooter', 'شكرًا لتعاملكم مع محمد السعيد. يرجى الحفاظ على البدلة وإرجاعها في الموعد المحدد.', 'Invoice Footer'],
        ['security_pin', '1234', 'Security PIN Code'],
        ['store_logoPosition', 'right', 'Logo Position']
      ];

      for (const [key, val, desc] of defaultStoreSettings) {
        const row = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
        if (!row) {
          db.prepare('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)').run(key, val, desc);
        }
      }

      // 4. Seed default logo if not set
      const logoRow = db.prepare("SELECT value FROM settings WHERE key = 'store_logo'").get();
      if (!logoRow || !logoRow.value || !logoRow.value.trim()) {
        try {
          const logoPath = path.join(__dirname, '..', '..', 'renderer', 'logo.png');
          if (fs.existsSync(logoPath)) {
            const buf = fs.readFileSync(logoPath);
            const base64 = 'data:image/png;base64,' + buf.toString('base64');
            db.prepare("INSERT OR REPLACE INTO settings (key, value, description) VALUES ('store_logo', ?, 'Store Logo')").run(base64);
            logger.info('Seeded default store logo');
          }
        } catch (_) {}
      }
    } catch (seedErr) {
      logger.warn(`Non-fatal error seeding default data: ${seedErr.message}`);
    }
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

