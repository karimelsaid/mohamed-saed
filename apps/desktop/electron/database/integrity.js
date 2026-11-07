const { logger } = require('../logging/logger');

class DatabaseIntegrity {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  checkIntegrity() {
    const db = this.dbConn.getDb();
    logger.info('Running SQLite PRAGMA integrity_check...');

    const integrityRow = db.prepare('PRAGMA integrity_check;').get();
    const isIntegrityOk = Object.values(integrityRow)[0] === 'ok';

    logger.info('Running SQLite PRAGMA foreign_key_check...');
    const fkErrors = db.prepare('PRAGMA foreign_key_check;').all();

    const stats = this.getTableStats();

    return {
      integrityOk: isIntegrityOk,
      foreignKeysOk: fkErrors.length === 0,
      foreignKeyViolations: fkErrors,
      tableStats: stats,
      checkedAt: new Date().toISOString()
    };
  }

  getTableStats() {
    const db = this.dbConn.getDb();
    const tables = [
      'suit_models',
      'suit_units',
      'bookings',
      'customers',
      'sales',
      'invoices',
      'payments',
      'cash_sessions',
      'tasks'
    ];

    const stats = {};
    for (const table of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        stats[table] = row ? row.count : 0;
      } catch {
        stats[table] = -1;
      }
    }
    return stats;
  }
}

module.exports = { DatabaseIntegrity };
