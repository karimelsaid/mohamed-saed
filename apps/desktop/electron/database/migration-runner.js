const fs = require('fs');
const path = require('path');
const { logger } = require('../logging/logger');

class MigrationRunner {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  initMigrationsTable() {
    const db = this.dbConn.getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  getAppliedMigrations() {
    this.initMigrationsTable();
    const rows = this.dbConn.all('SELECT filename FROM schema_migrations ORDER BY id ASC');
    return new Set(rows.map(r => r.filename));
  }

  runPendingMigrations() {
    this.initMigrationsTable();
    const applied = this.getAppliedMigrations();
    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      logger.info('Database Schema is up-to-date. No pending migrations.');
      return { success: true, appliedCount: 0, pendingCount: 0 };
    }

    logger.info(`Found ${pending.length} pending migrations to apply...`);
    const db = this.dbConn.getDb();

    let appliedCount = 0;
    for (const file of pending) {
      const filePath = path.join(this.migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      logger.info(`Applying migration: ${file}...`);
      
      // Execute in explicit transaction
      db.exec('BEGIN IMMEDIATE;');
      try {
        db.exec(sql);
        const insertStmt = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');
        insertStmt.run(file);
        db.exec('COMMIT;');
        appliedCount++;
        logger.info(`Successfully applied migration: ${file}`);
      } catch (err) {
        db.exec('ROLLBACK;');
        logger.error(`Migration failed on file [${file}]:`, { error: err.message });
        throw new Error(`Failed applying migration ${file}: ${err.message}`);
      }
    }

    return {
      success: true,
      appliedCount,
      pendingCount: 0,
      latestMigration: pending[pending.length - 1]
    };
  }

  getSchemaVersion() {
    this.initMigrationsTable();
    const row = this.dbConn.get('SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1');
    return row ? row.filename : 'none';
  }
}

module.exports = { MigrationRunner };
