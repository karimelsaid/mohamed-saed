const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { FinanceRepository } = require('../database/repositories/finance-repo');
const { logger } = require('../logging/logger');

class FinanceEngineService {
  constructor(dbConn = dbConnection, financeRepo = null) {
    this.dbConn = dbConn;
    this.financeRepo = financeRepo || new FinanceRepository(dbConn);
  }

  // =========================================================================
  // 1. CASH SESSIONS LIFECYCLE (دورة حياة جلسات الصندوق والوردية)
  // =========================================================================

  /**
   * جلب تفاصيل جلسة الصندوق النشطة المفتوحة حاليًا مع تفصيل الحركات
   */
  getActiveCashSession() {
    const session = this.dbConn.get(`
      SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1
    `);

    if (!session) return null;

    // Detailed transaction breakdown by category
    const breakdown = this.dbConn.all(`
      SELECT category, transaction_type,
             COUNT(*) as count,
             COALESCE(SUM(amount), 0) as total_amount
      FROM cash_transactions
      WHERE cash_session_id = ?
      GROUP BY category, transaction_type
    `, [session.id]);

    let rentalIn = 0;
    let saleIn = 0;
    let depositIn = 0;
    let depositRefundOut = 0;
    let expenseOut = 0;
    let manualIn = 0;
    let manualOut = 0;

    for (const b of breakdown) {
      if (b.category === 'RENTAL' && b.transaction_type === 'IN') rentalIn += b.total_amount;
      if (b.category === 'SALE' && b.transaction_type === 'IN') saleIn += b.total_amount;
      if (b.category === 'DEPOSIT' && b.transaction_type === 'IN') depositIn += b.total_amount;
      if ((b.category === 'DEPOSIT_REFUND' || b.category === 'DEPOSIT') && b.transaction_type === 'OUT') depositRefundOut += b.total_amount;
      if (b.category === 'EXPENSE' && b.transaction_type === 'OUT') expenseOut += b.total_amount;
      if (b.category === 'MANUAL_IN' && b.transaction_type === 'IN') manualIn += b.total_amount;
      if (b.category === 'MANUAL_OUT' && b.transaction_type === 'OUT') manualOut += b.total_amount;
    }

    // Recent 50 transactions
    const recentTransactions = this.dbConn.all(`
      SELECT * FROM cash_transactions
      WHERE cash_session_id = ?
      ORDER BY id DESC
      LIMIT 50
    `, [session.id]);

    const txCount = this.dbConn.get('SELECT COUNT(*) as total FROM cash_transactions WHERE cash_session_id = ?', [session.id]).total;

    return {
      ...session,
      transaction_count: txCount,
      breakdown: {
        rentalIn,
        saleIn,
        depositIn,
        depositRefundOut,
        expenseOut,
        manualIn,
        manualOut
      },
      recent_transactions: recentTransactions
    };
  }

  /**
   * فتح جلسة صندوق جديدة برصيد افتتاحي
   */
  openCashSession({ openingBalance = 0, sessionCode = null, notes = '' } = {}) {
    const existing = this.dbConn.get("SELECT id, session_code FROM cash_sessions WHERE status = 'OPEN' LIMIT 1");
    if (existing) {
      throw new Error(`توجد بالفعل جلسة صندوق مفتوحة برقم [${existing.session_code}]. يجب إغلاقها أولاً قبل فتح جلسة جديدة.`);
    }

    const opBal = Math.max(0, Number(openingBalance) || 0);
    const code = sessionCode || `SES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const stmt = tDb.prepare(`
        INSERT INTO cash_sessions (session_code, opened_at, opening_balance, total_cash_in, total_cash_out, calculated_balance, status, notes)
        VALUES (?, datetime('now'), ?, 0, 0, ?, 'OPEN', ?)
      `);
      const res = stmt.run(code, opBal, opBal, notes);
      const sessionId = res.lastInsertRowid;

      if (opBal > 0) {
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, notes)
          VALUES (?, 'IN', 'MANUAL_IN', ?, 'OPENING_BALANCE', 'رصيد افتتاحي للدرج عند فتح الوردية')
        `).run(sessionId, opBal);
      }

      logger.info(`Opened Cash Session #${sessionId} (${code}) with opening balance: ${opBal} EGP`);
      return {
        id: sessionId,
        sessionCode: code,
        openingBalance: opBal,
        openedAt: new Date().toISOString()
      };
    });
  }

  /**
   * إغلاق جلسة الصندوق ومقارنة الرصيد المحسوب بالفعلي واحتساب العجز أو الزيادة
   */
  closeCashSession({ actualBalance, notes = '' }) {
    if (actualBalance === undefined || actualBalance === null || isNaN(actualBalance)) {
      throw new Error('يرجى إدخال الرصيد الفعلي الموجود بالدرج لإتمام الإغلاق.');
    }

    const actual = Number(actualBalance);
    if (actual < 0) {
      throw new Error('الرصيد الفعلي لا يمكن أن يكون بالسالب.');
    }

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const session = tDb.prepare("SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get();
      if (!session) {
        throw new Error('لا توجد جلسة صندوق مفتوحة حاليًا لإغلاقها.');
      }

      const difference = actual - session.calculated_balance;

      tDb.prepare(`
        UPDATE cash_sessions
        SET closed_at = datetime('now'),
            actual_balance = ?,
            difference = ?,
            status = 'CLOSED',
            notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(actual, difference, notes, session.id);

      let discrepancyText = 'متطابق تماماً';
      if (difference < 0) {
        discrepancyText = `عجز بمقدار ${Math.abs(difference)} ج.م`;
      } else if (difference > 0) {
        discrepancyText = `زيادة بمقدار ${difference} ج.م`;
      }

      logger.info(`Closed Cash Session #${session.id} (${session.session_code}). Calculated: ${session.calculated_balance}, Actual: ${actual}, Discrepancy: ${discrepancyText}`);

      return {
        sessionId: session.id,
        sessionCode: session.session_code,
        openingBalance: session.opening_balance,
        totalCashIn: session.total_cash_in,
        totalCashOut: session.total_cash_out,
        calculatedBalance: session.calculated_balance,
        actualBalance: actual,
        difference,
        discrepancyText,
        closedAt: new Date().toISOString()
      };
    });
  }

  /**
   * جلب سجل جلسات الصندوق السابقة والمنتهية
   */
  getSessionsList({ limit = 30, offset = 0 } = {}) {
    const sql = `
      SELECT s.*,
             (SELECT COUNT(*) FROM cash_transactions ct WHERE ct.cash_session_id = s.id) as transaction_count
      FROM cash_sessions s
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `;
    return this.dbConn.all(sql, [limit, offset]);
  }

  // =========================================================================
  // 2. EXPENSE MANAGEMENT (إدارة المصروفات التشغيلية والنثرية)
  // =========================================================================

  /**
   * جلب تصنيفات المصروفات المعتمدة
   */
  getExpenseCategories() {
    return this.dbConn.all(`
      SELECT ec.*,
             (SELECT COUNT(*) FROM expenses e WHERE e.category_id = ec.id) as expense_count,
             (SELECT COALESCE(SUM(amount), 0) FROM expenses e WHERE e.category_id = ec.id) as total_spent
      FROM expense_categories ec
      WHERE ec.is_active = 1
      ORDER BY ec.id ASC
    `);
  }

  /**
   * إضافة تصنيف مصروف جديد
   */
  createExpenseCategory({ name, description = '' }) {
    if (!name || !name.trim()) throw new Error('اسم تصنيف المصروف مطلوب.');
    const db = this.dbConn.getDb();
    const res = db.prepare('INSERT INTO expense_categories (name, description, is_active) VALUES (?, ?, 1)')
      .run(name.trim(), description.trim());
    return { id: res.lastInsertRowid, name: name.trim(), description };
  }

  /**
   * تسجيل سند صرف / مصروف جديد وخصمه من الخزينة
   */
  recordExpense({
    category_id,
    amount,
    description,
    payment_method = 'CASH',
    receipt_image_path = null
  }) {
    if (!category_id) throw new Error('يرجى تحديد تصنيف المصروف.');
    const expAmount = Number(amount);
    if (!expAmount || expAmount <= 0) throw new Error('قيمة المصروف يجب أن تكون أكبر من الصفر.');
    if (!description || !description.trim()) throw new Error('بيان وتفاصيل المصروف حقل إلزامي.');

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Verify category
      const cat = tDb.prepare('SELECT id, name FROM expense_categories WHERE id = ?').get(category_id);
      if (!cat) throw new Error('تصنيف المصروف غير صالح أو غير موجود.');

      // 2. Active cash session check for cash payment
      let cashSession = tDb.prepare("SELECT id, session_code, calculated_balance FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
      if (payment_method === 'CASH' && !cashSession) {
        // Auto open if none open
        const sessionRes = this.financeRepo.openCashSession(0, `SES-EXP-${Date.now().toString().slice(-6)}`);
        cashSession = { id: sessionRes.id, session_code: sessionRes.sessionCode, calculated_balance: 0 };
      }

      // 3. Generate expense number
      const expenseNumber = `EXP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      // 4. Insert into expenses
      const expRes = tDb.prepare(`
        INSERT INTO expenses (expense_number, cash_session_id, category_id, amount, description, receipt_image_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(expenseNumber, cashSession ? cashSession.id : null, category_id, expAmount, description.trim(), receipt_image_path);
      const expenseId = expRes.lastInsertRowid;

      // 5. If CASH, deduct from active drawer session
      if (payment_method === 'CASH' && cashSession) {
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
          VALUES (?, 'OUT', 'EXPENSE', ?, 'EXPENSE', ?, ?)
        `).run(cashSession.id, expAmount, expenseId, `مصروف: ${cat.name} - ${description.trim()}`);

        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_out = total_cash_out + ?,
              calculated_balance = calculated_balance - ?
          WHERE id = ?
        `).run(expAmount, expAmount, cashSession.id);
      }

      logger.info(`Recorded Expense #${expenseNumber}: ${expAmount} EGP (${cat.name})`);
      return {
        success: true,
        expenseId,
        expenseNumber,
        categoryName: cat.name,
        amount: expAmount,
        paymentMethod: payment_method
      };
    });
  }

  /**
   * جلب قائمة المصروفات مع الفلاتر
   */
  getExpenses({ categoryId = null, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT e.*, ec.name as category_name, cs.session_code
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN cash_sessions cs ON e.cash_session_id = cs.id
      WHERE 1=1
    `;
    const params = [];

    if (categoryId) {
      sql += ' AND e.category_id = ?';
      params.push(categoryId);
    }

    sql += ' ORDER BY e.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.dbConn.all(sql, params);
  }

  // =========================================================================
  // 3. MANUAL CASH ADJUSTMENTS (إيداع نثريات وسحب مسحوبات شخصية)
  // =========================================================================

  recordCashAdjustment({ type = 'IN', amount, reason = '' }) {
    const adjAmount = Number(amount);
    if (!adjAmount || adjAmount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من الصفر.');
    if (!reason || !reason.trim()) throw new Error('سبب الإيداع أو السحب حقل إلزامي.');

    const cleanType = type === 'OUT' ? 'OUT' : 'IN';
    const category = cleanType === 'IN' ? 'MANUAL_IN' : 'MANUAL_OUT';

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const session = tDb.prepare("SELECT id, session_code, calculated_balance FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
      if (!session) {
        throw new Error('لا توجد جلسة صندوق مفتوحة حالياً لتنفيذ حركة النقدية.');
      }

      tDb.prepare(`
        INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, notes)
        VALUES (?, ?, ?, ?, 'MANUAL_ADJUSTMENT', ?)
      `).run(session.id, cleanType, category, adjAmount, reason.trim());

      if (cleanType === 'IN') {
        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_in = total_cash_in + ?,
              calculated_balance = calculated_balance + ?
          WHERE id = ?
        `).run(adjAmount, adjAmount, session.id);
      } else {
        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_out = total_cash_out + ?,
              calculated_balance = calculated_balance - ?
          WHERE id = ?
        `).run(adjAmount, adjAmount, session.id);
      }

      const updated = tDb.prepare('SELECT calculated_balance FROM cash_sessions WHERE id = ?').get(session.id);
      logger.info(`Manual Cash Adjustment (${cleanType}) of ${adjAmount} EGP: ${reason}. New balance: ${updated.calculated_balance}`);

      return {
        success: true,
        type: cleanType,
        amount: adjAmount,
        newBalance: updated.calculated_balance
      };
    });
  }

  // =========================================================================
  // 4. SECURITY DEPOSIT ISOLATION / ESCROW (عزل التأمينات كأمانات معلقة)
  // =========================================================================

  /**
   * حساب التأمينات المعلقة كأمانات للعملاء وعدم خلطها بأرباح المحل
   */
  getEscrowDepositsSummary() {
    const activeDeposits = this.dbConn.all(`
      SELECT b.id as booking_id,
             b.booking_number,
             b.pickup_date,
             b.return_due_date,
             b.status,
             b.total_deposit_amount,
             b.deposit_paid,
             b.deposit_refunded,
             (b.deposit_paid - b.deposit_refunded) as remaining_deposit,
             c.name as customer_name,
             c.phone as customer_phone
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      WHERE b.deposit_paid > b.deposit_refunded
        AND b.status IN ('CONFIRMED', 'PREPARED', 'DELIVERED', 'RETURNED')
      ORDER BY b.id DESC
    `);

    const totals = this.dbConn.get(`
      SELECT
        COALESCE(SUM(deposit_paid), 0) as total_deposits_received,
        COALESCE(SUM(deposit_refunded), 0) as total_deposits_refunded,
        COALESCE(SUM(deposit_paid - deposit_refunded), 0) as net_escrow_held
      FROM bookings
      WHERE deposit_paid > 0
    `);

    return {
      netEscrowHeld: totals ? totals.net_escrow_held : 0,
      totalDepositsReceived: totals ? totals.total_deposits_received : 0,
      totalDepositsRefunded: totals ? totals.total_deposits_refunded : 0,
      activeDepositsCount: activeDeposits.length,
      activeDepositsList: activeDeposits
    };
  }

  // =========================================================================
  // 5. FINANCIAL DASHBOARD & SUMMARY (ملخص الأرباح والتدفق النقدي)
  // =========================================================================

  getFinancialSummary() {
    // 1. Sales revenue (Net sales minus refunds)
    const salesTot = this.dbConn.get(`
      SELECT COALESCE(SUM(total_amount), 0) as total_sales FROM sales
    `).total_sales;

    const returnsTot = this.dbConn.get(`
      SELECT COALESCE(SUM(total_refund), 0) as total_returns FROM sales_returns
    `).total_returns;
    const netSalesRevenue = Math.max(0, salesTot - returnsTot);

    // 2. Rental revenue (Actual paid rentals excluding deposits)
    const rentalRevenue = this.dbConn.get(`
      SELECT COALESCE(SUM(amount), 0) as total_rental
      FROM payments
      WHERE payment_type IN ('RENTAL_ADVANCE', 'RENTAL_REMAINDER')
    `).total_rental;

    // 3. Late fees & Damage fees
    const fees = this.dbConn.get(`
      SELECT
        COALESCE(SUM(late_fee), 0) as total_late_fees,
        COALESCE(SUM(damage_fee), 0) as total_damage_fees
      FROM bookings
    `);

    // 4. Operating Expenses
    const totalExpenses = this.dbConn.get(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses
    `).total_expenses;

    // 5. Cost of Goods Sold (COGS / تكلفة البضاعة المباعة للبيع المباشر والقطع)
    const cogsRow = this.dbConn.get(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN si.product_variant_id IS NOT NULL THEN (COALESCE(p.cost_price, 0) * si.quantity)
          WHEN si.suit_unit_id IS NOT NULL THEN COALESCE(NULLIF(u.purchase_cost, 0), sm.cost_price, 0)
          ELSE 0
        END
      ), 0) as total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN suit_units u ON si.suit_unit_id = u.id
      LEFT JOIN suit_models sm ON u.suit_model_id = sm.id
    `);
    const totalCogs = cogsRow ? cogsRow.total_cogs : 0;

    // 6. Escrow Deposits Held (Liabilities - NOT Revenue)
    const escrow = this.getEscrowDepositsSummary();

    // 7. Current active cash session
    const activeSession = this.getActiveCashSession();

    // Gross Operating Revenue = Net Sales + Rental Revenue + Late Fees + Damage Fees
    const grossOperatingRevenue = netSalesRevenue + rentalRevenue + fees.total_late_fees + fees.total_damage_fees;
    // Gross Profit = Gross Revenue - Cost of Goods Sold
    const grossProfit = Math.max(0, grossOperatingRevenue - totalCogs);
    // Net Operating Profit = Gross Profit - Operating Expenses
    const netOperatingProfit = grossProfit - totalExpenses;

    return {
      netSalesRevenue,
      rentalRevenue,
      lateFeesRevenue: fees.total_late_fees,
      damageFeesRevenue: fees.total_damage_fees,
      grossOperatingRevenue,
      totalCogs,
      grossProfit,
      totalExpenses,
      netOperatingProfit,
      escrowDepositsHeld: escrow.netEscrowHeld,
      activeDepositsCount: escrow.activeDepositsCount,
      currentDrawerCash: activeSession ? activeSession.calculated_balance : 0,
      isSessionOpen: !!activeSession,
      activeSessionCode: activeSession ? activeSession.session_code : null
    };
  }
}

const financeEngineService = new FinanceEngineService();

module.exports = {
  FinanceEngineService,
  financeEngineService
};
