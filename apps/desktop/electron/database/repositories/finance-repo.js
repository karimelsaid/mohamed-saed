const { TransactionHelper } = require('../transaction-helper');

class FinanceRepository {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  getActiveCashSession() {
    return this.dbConn.get(`
      SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1
    `);
  }

  openCashSession(openingBalance = 0, sessionCode = null) {
    const existing = this.getActiveCashSession();
    if (existing) {
      throw new Error(`توجد بالفعل جلسة صندوق مفتوحة برقم [${existing.session_code}]. يجب إغلاقها أولاً.`);
    }

    const code = sessionCode || `SES-${Date.now().toString().slice(-6)}`;
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO cash_sessions (session_code, opening_balance, calculated_balance, status)
      VALUES (?, ?, ?, 'OPEN')
    `);
    const res = stmt.run(code, openingBalance, openingBalance);
    return { id: res.lastInsertRowid, sessionCode: code, openingBalance };
  }

  recordCashTransaction(sessionId, type, category, amount, refType = null, refId = null, notes = null) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Insert transaction
      const transStmt = tDb.prepare(`
        INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const res = transStmt.run(sessionId, type, category, amount, refType, refId, notes);

      // 2. Update session balances
      if (type === 'IN') {
        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_in = total_cash_in + ?,
              calculated_balance = calculated_balance + ?
          WHERE id = ?
        `).run(amount, amount, sessionId);
      } else {
        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_out = total_cash_out + ?,
              calculated_balance = calculated_balance - ?
          WHERE id = ?
        `).run(amount, amount, sessionId);
      }

      return res.lastInsertRowid;
    });
  }

  closeCashSession(sessionId, actualBalance, notes = null) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const session = tDb.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(sessionId);
      if (!session || session.status !== 'OPEN') {
        throw new Error('جلسة الصندوق غير موجودة أو مغلقة مسبقًا.');
      }

      const difference = actualBalance - session.calculated_balance;

      tDb.prepare(`
        UPDATE cash_sessions
        SET closed_at = datetime('now'),
            actual_balance = ?,
            difference = ?,
            status = 'CLOSED',
            notes = ?
        WHERE id = ?
      `).run(actualBalance, difference, notes, sessionId);

      return {
        sessionId,
        calculatedBalance: session.calculated_balance,
        actualBalance,
        difference
      };
    });
  }
}

module.exports = { FinanceRepository };
