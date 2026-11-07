const { logger } = require('../logging/logger');

class TransactionHelper {
  static runInTransaction(db, callback) {
    if (!db) throw new Error('Database instance is required for transaction execution.');

    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback(db);
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch (rollbackErr) {
        logger.error('Rollback error after transaction failure:', { error: rollbackErr.message });
      }
      logger.error('Transaction failed and was rolled back successfully:', { error: err.message });
      throw err;
    }
  }

  static async runInTransactionAsync(db, asyncCallback) {
    if (!db) throw new Error('Database instance is required for transaction execution.');

    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = await asyncCallback(db);
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch (rollbackErr) {
        logger.error('Rollback error after transaction failure:', { error: rollbackErr.message });
      }
      logger.error('Async Transaction failed and was rolled back:', { error: err.message });
      throw err;
    }
  }
}

module.exports = { TransactionHelper };
