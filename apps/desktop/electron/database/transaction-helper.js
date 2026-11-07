const { logger } = require('../logging/logger');

class TransactionHelper {
  static depth = 0;

  static runInTransaction(db, callback) {
    if (!db) throw new Error('Database instance is required for transaction execution.');

    if (TransactionHelper.depth > 0) {
      // Nested transaction inside an existing one: use SQLite SAVEPOINT
      const spName = `SP_NESTED_${TransactionHelper.depth}`;
      TransactionHelper.depth++;
      db.exec(`SAVEPOINT ${spName};`);
      try {
        const result = callback(db);
        db.exec(`RELEASE SAVEPOINT ${spName};`);
        TransactionHelper.depth--;
        return result;
      } catch (err) {
        try {
          db.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
        } catch (spErr) {
          logger.error('Savepoint rollback error:', { error: spErr.message });
        }
        TransactionHelper.depth--;
        throw err;
      }
    }

    // Top-level root transaction
    TransactionHelper.depth++;
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback(db);
      db.exec('COMMIT;');
      TransactionHelper.depth--;
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch (rollbackErr) {
        logger.error('Rollback error after transaction failure:', { error: rollbackErr.message });
      }
      TransactionHelper.depth = 0;
      logger.error('Transaction failed and was rolled back successfully:', { error: err.message });
      throw err;
    }
  }

  static async runInTransactionAsync(db, asyncCallback) {
    if (!db) throw new Error('Database instance is required for transaction execution.');

    if (TransactionHelper.depth > 0) {
      const spName = `SP_ASYNC_${TransactionHelper.depth}`;
      TransactionHelper.depth++;
      db.exec(`SAVEPOINT ${spName};`);
      try {
        const result = await asyncCallback(db);
        db.exec(`RELEASE SAVEPOINT ${spName};`);
        TransactionHelper.depth--;
        return result;
      } catch (err) {
        try {
          db.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
        } catch (spErr) {
          logger.error('Savepoint rollback error:', { error: spErr.message });
        }
        TransactionHelper.depth--;
        throw err;
      }
    }

    TransactionHelper.depth++;
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = await asyncCallback(db);
      db.exec('COMMIT;');
      TransactionHelper.depth--;
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch (rollbackErr) {
        logger.error('Rollback error after transaction failure:', { error: rollbackErr.message });
      }
      TransactionHelper.depth = 0;
      logger.error('Async Transaction failed and was rolled back:', { error: err.message });
      throw err;
    }
  }
}

module.exports = { TransactionHelper };
