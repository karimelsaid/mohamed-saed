const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { FinanceRepository } = require('../database/repositories/finance-repo');
const { InventoryEngineService } = require('./inventory-engine-service');
const { logger } = require('../logging/logger');

class PosSalesService {
  constructor(dbConn = dbConnection, inventorySvc = null, financeRepo = null) {
    this.dbConn = dbConn;
    this.inventoryService = inventorySvc || new InventoryEngineService(dbConn);
    this.financeRepo = financeRepo || new FinanceRepository(dbConn);
    this._ensureTables();
  }

  _ensureTables() {
    try {
      const db = this.dbConn.getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS sale_return_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          return_id INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
          sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
          quantity INTEGER NOT NULL DEFAULT 1,
          refund_amount REAL NOT NULL,
          condition TEXT NOT NULL DEFAULT 'GOOD',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    } catch (err) {
      logger.error('Failed to ensure sale_return_items table:', err);
    }
  }

  // =========================================================================
  // 1. POS CATALOG & BARCODE LOOKUP (كتالوج المنتجات وقارئ الباركود)
  // =========================================================================

  /**
   * جلب الأصناف المتاحة للبيع المباشر (أحذية، إكسسوارات، بدل بيع) مع أرصدتها
   */
  getSellableCatalog(opts = {}) {
    if (typeof opts === 'string') opts = { categoryType: opts };
    let { categoryType = null, search = '' } = opts || {};
    if (typeof search !== 'string') search = '';
    const normCat = categoryType ? String(categoryType).trim().toUpperCase() : null;
    const isAll = !normCat || normCat === 'ALL';

    let sql = `
      SELECT pv.id as variant_id,
             p.id as product_id,
             p.code as product_code,
             p.name as product_name,
             c.name as category_name,
             c.type as category_type,
             s.name as size_name,
             col.name as color_name,
             pv.sku,
             pv.barcode,
             (p.sale_price + pv.additional_price) as unit_price,
             COALESCE(b.quantity_on_hand, 0) as quantity_on_hand,
             COALESCE(b.quantity_reserved, 0) as quantity_reserved,
             (COALESCE(b.quantity_on_hand, 0) - COALESCE(b.quantity_reserved, 0)) as available_quantity,
             COALESCE(b.warehouse_id, 1) as warehouse_id,
             'VARIANT' as item_type
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN colors col ON pv.color_id = col.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id AND b.warehouse_id = 1
      WHERE p.is_active = 1 AND pv.is_active = 1
    `;
    const params = [];

    if (!isAll) {
      sql += ' AND (c.type = ? OR c.code = ? OR c.name = ? OR c.id = ?)';
      params.push(String(categoryType), String(categoryType), String(categoryType), Number(categoryType) || -1);
    }

    if (search) {
      sql += ' AND (p.name LIKE ? OR p.code LIKE ? OR pv.sku LIKE ? OR pv.barcode LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY p.name ASC, pv.id ASC';
    const variants = this.dbConn.all(sql, params);

    // Also fetch available suit units designated for sale (models with sale_price > 0 or rental_price > 0)
    let suitsSql = `
      SELECT u.id as suit_unit_id,
             m.id as model_id,
             m.code as model_code,
             m.name as model_name,
             'بدل رجالي' as category_name,
             'SUITS' as category_type,
             s.name as size_name,
             col.name as color_name,
             u.unit_barcode as barcode,
             u.unit_barcode as sku,
             COALESCE(NULLIF(m.sale_price, 0), m.rental_price * 2, m.rental_price, 0) as unit_price,
             1 as quantity_on_hand,
             0 as quantity_reserved,
             1 as available_quantity,
             u.warehouse_id,
             'SUIT_UNIT' as item_type
      FROM suit_units u
      JOIN suit_models m ON u.suit_model_id = m.id
      LEFT JOIN sizes s ON u.size_id = s.id
      LEFT JOIN colors col ON m.color_id = col.id
      WHERE u.status = 'AVAILABLE' AND (m.sale_price > 0 OR m.rental_price > 0)
    `;
    const suitParams = [];
    if (search) {
      suitsSql += ' AND (m.name LIKE ? OR m.code LIKE ? OR u.unit_barcode LIKE ?)';
      const sTerm = `%${search.trim()}%`;
      suitParams.push(sTerm, sTerm, sTerm);
    }
    suitsSql += ' ORDER BY m.name ASC LIMIT 50';

    let suitUnits = [];
    const isSuitCat = !categoryType || ['ALL', 'SUITS', 'SUIT', 'بدل رجالي', 'بدل'].includes(String(categoryType).trim().toUpperCase());
    if (isSuitCat) {
      suitUnits = this.dbConn.all(suitsSql, suitParams);
    }

    return [...variants, ...suitUnits];
  }

  /**
   * البحث الفوري عبر الباركود أو الـ SKU للإضافة السريعة للسلة
   */
  lookupBarcode(codeOrBarcode) {
    if (!codeOrBarcode) return null;
    const clean = String(codeOrBarcode).trim();

    // 1. Search in Product Variants (Shoes, Accessories)
    const variant = this.dbConn.get(`
      SELECT pv.id as variant_id,
             p.id as product_id,
             p.code as product_code,
             p.name as product_name,
             c.name as category_name,
             s.name as size_name,
             col.name as color_name,
             pv.sku,
             pv.barcode,
             (p.sale_price + pv.additional_price) as unit_price,
             COALESCE(b.quantity_on_hand, 0) as quantity_on_hand,
             (COALESCE(b.quantity_on_hand, 0) - COALESCE(b.quantity_reserved, 0)) as available_quantity,
             COALESCE(b.warehouse_id, 1) as warehouse_id,
             'VARIANT' as item_type
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN colors col ON pv.color_id = col.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id AND b.warehouse_id = 1
      WHERE pv.barcode = ? OR pv.sku = ? OR p.code = ?
      LIMIT 1
    `, [clean, clean, clean]);

    if (variant) return variant;

    // 2. Search in Suit Units (Individual items)
    const suitUnit = this.dbConn.get(`
      SELECT u.id as suit_unit_id,
             m.id as model_id,
             m.code as model_code,
             m.name as model_name,
             'بدل رجالي' as category_name,
             'SUITS' as category_type,
             s.name as size_name,
             col.name as color_name,
             u.unit_barcode as barcode,
             u.unit_barcode as sku,
             COALESCE(NULLIF(m.sale_price, 0), m.rental_price * 2, m.rental_price, 0) as unit_price,
             1 as quantity_on_hand,
             (CASE WHEN u.status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_quantity,
             u.warehouse_id,
             u.status,
             'SUIT_UNIT' as item_type
      FROM suit_units u
      JOIN suit_models m ON u.suit_model_id = m.id
      LEFT JOIN sizes s ON u.size_id = s.id
      LEFT JOIN colors col ON m.color_id = col.id
      WHERE u.unit_barcode = ?
      LIMIT 1
    `, [clean]);

    if (suitUnit) return suitUnit;

    return null;
  }

  // =========================================================================
  // 2. CREATE DIRECT SALE WITH ZERO NEGATIVE STOCK & CASH SESSION LINKING
  // =========================================================================

  /**
   * إنشاء عملية بيع مباشر مع التحقق الصارم من المخزون الذري وتسجيل الدفعة والفاتورة
   */
  createDirectSale({
    customer_id = null,
    items = [],
    discount = 0,
    tax = 0,
    paid_amount = 0,
    payment_method = 'CASH',
    warehouse_id = 1,
    notes = ''
  }) {
    if (!items || items.length === 0) {
      throw new Error('لا يمكن إتمام البيع: سلة المشتريات فارغة.');
    }

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Verify and link active cash session
      let cashSession = this.financeRepo.getActiveCashSession();
      if (!cashSession) {
        // Auto-create a default daily cash session if none is open
        const sessionRes = this.financeRepo.openCashSession(0, `SES-AUTO-${Date.now().toString().slice(-6)}`);
        cashSession = { id: sessionRes.id, session_code: sessionRes.sessionCode };
        logger.info(`Auto-opened cash session #${cashSession.id} for POS sale`);
      }

      // 2. Validate line items and stock availability (Zero Negative Stock)
      let calculatedSubtotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const qty = Number(item.quantity) || 1;
        if (qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من الصفر.');

        if (item.product_variant_id) {
          // Check stock balance
          let bal = tDb.prepare(`
            SELECT quantity_on_hand, quantity_reserved
            FROM stock_balances
            WHERE warehouse_id = ? AND product_variant_id = ?
          `).get(warehouse_id, item.product_variant_id);

          const onHand = bal ? bal.quantity_on_hand : 0;
          const reserved = bal ? bal.quantity_reserved : 0;
          const available = onHand - reserved;

          if (available < qty) {
            throw new Error(`عجز في المخزون: لا توجد كمية كافية للبيع. الرصيد المتاح [${available}] والمطلوب [${qty}]. يمنع الرصيد السالب.`);
          }

          const unitPrice = Number(item.unit_price) || 0;
          const itemDiscount = Number(item.discount) || 0;
          const lineTotal = Math.max(0, (unitPrice * qty) - itemDiscount);
          calculatedSubtotal += lineTotal;

          validatedItems.push({
            product_variant_id: item.product_variant_id,
            suit_unit_id: null,
            quantity: qty,
            unit_price: unitPrice,
            discount: itemDiscount,
            total_price: lineTotal
          });
        } else if (item.suit_unit_id) {
          // Individual suit unit sale
          const unit = tDb.prepare('SELECT id, status FROM suit_units WHERE id = ?').get(item.suit_unit_id);
          if (!unit || unit.status !== 'AVAILABLE') {
            throw new Error(`البدلة رقم #${item.suit_unit_id} غير متاحة للبيع (حالتها الحالية: ${unit ? unit.status : 'غير موجودة'}).`);
          }

          const unitPrice = Number(item.unit_price) || 0;
          const itemDiscount = Number(item.discount) || 0;
          const lineTotal = Math.max(0, unitPrice - itemDiscount);
          calculatedSubtotal += lineTotal;

          validatedItems.push({
            product_variant_id: null,
            suit_unit_id: item.suit_unit_id,
            quantity: 1,
            unit_price: unitPrice,
            discount: itemDiscount,
            total_price: lineTotal
          });
        } else {
          throw new Error('بيانات الصنف غير صحيحة: يجب تحديد صنف أو بدلة.');
        }
      }

      // 3. Totals calculation
      const overallDiscount = Math.max(0, Number(discount) || 0);
      const taxAmount = Math.max(0, Number(tax) || 0);
      const finalTotal = Math.max(0, calculatedSubtotal - overallDiscount + taxAmount);
      const paid = Number(paid_amount) >= finalTotal ? Number(paid_amount) : finalTotal;
      const change = Math.max(0, paid - finalTotal);

      // 4. Generate unique sale number
      const saleNumber = `SALE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      // 5. Insert Sale Header
      const saleRes = tDb.prepare(`
        INSERT INTO sales (
          sale_number, customer_id, subtotal, discount, tax, total_amount, paid_amount,
          change_amount, payment_method, cash_session_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        saleNumber, customer_id || null, calculatedSubtotal, overallDiscount,
        taxAmount, finalTotal, paid, change, payment_method, cashSession.id
      );
      const saleId = saleRes.lastInsertRowid;

      // 6. Insert Line Items and Deduct Stock Atomically
      const itemStmt = tDb.prepare(`
        INSERT INTO sale_items (sale_id, product_variant_id, suit_unit_id, quantity, unit_price, discount, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const vi of validatedItems) {
        itemStmt.run(saleId, vi.product_variant_id, vi.suit_unit_id, vi.quantity, vi.unit_price, vi.discount, vi.total_price);

        if (vi.product_variant_id) {
          // Deduct from stock_balances
          tDb.prepare(`
            UPDATE stock_balances
            SET quantity_on_hand = quantity_on_hand - ?,
                updated_at = datetime('now')
            WHERE warehouse_id = ? AND product_variant_id = ?
          `).run(vi.quantity, warehouse_id, vi.product_variant_id);

          // Record in stock_movements ledger
          tDb.prepare(`
            INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, reference_id, notes)
            VALUES (?, ?, 'SALE', ?, 'SALE', ?, ?)
          `).run(warehouse_id, vi.product_variant_id, -vi.quantity, saleId, `مبيعات فاتورة #${saleNumber}`);
        } else if (vi.suit_unit_id) {
          // Mark suit unit as SOLD
          tDb.prepare(`
            UPDATE suit_units
            SET status = 'SOLD', updated_at = datetime('now')
            WHERE id = ?
          `).run(vi.suit_unit_id);

          // Record in unit status history
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, 'AVAILABLE', 'SOLD', 'بيع مباشر للبدلة', 'SALE', ?)
          `).run(vi.suit_unit_id, saleId);
        }
      }

      // 7. Generate Invoice
      const invoiceNumber = `INV-S-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
      const invRes = tDb.prepare(`
        INSERT INTO invoices (invoice_number, invoice_type, reference_id, customer_id, subtotal, discount, total, paid, due, created_at)
        VALUES (?, 'SALE', ?, ?, ?, ?, ?, ?, 0, datetime('now'))
      `).run(invoiceNumber, saleId, customer_id || null, calculatedSubtotal, overallDiscount, finalTotal, finalTotal);
      const invoiceId = invRes.lastInsertRowid;

      // Invoice line items
      const invItemStmt = tDb.prepare(`
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const vi of validatedItems) {
        const desc = vi.product_variant_id ? `صنف كود #${vi.product_variant_id}` : `بدلة وحدة #${vi.suit_unit_id}`;
        invItemStmt.run(invoiceId, desc, vi.quantity, vi.unit_price, vi.total_price);
      }

      // 8. Record Payment & Cash Transaction
      const paymentNumber = `PAY-S-${Date.now().toString().slice(-8)}`;
      tDb.prepare(`
        INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method, created_at)
        VALUES (?, ?, ?, 'SALE', ?, 'SALE', ?, ?, datetime('now'))
      `).run(paymentNumber, cashSession.id, customer_id || null, saleId, finalTotal, payment_method);

      if (payment_method === 'CASH') {
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
          VALUES (?, 'IN', 'SALE', ?, 'SALE', ?, ?)
        `).run(cashSession.id, finalTotal, saleId, `مبيعات نقدية فاتورة #${saleNumber}`);

        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_in = total_cash_in + ?,
              calculated_balance = calculated_balance + ?
          WHERE id = ?
        `).run(finalTotal, finalTotal, cashSession.id);
      }

      logger.info(`Sale created successfully: #${saleNumber} for amount: ${finalTotal} EGP`);
      return {
        success: true,
        saleId,
        saleNumber,
        invoiceNumber,
        subtotal: calculatedSubtotal,
        discount: overallDiscount,
        totalAmount: finalTotal,
        paidAmount: paid,
        changeAmount: change,
        paymentMethod: payment_method
      };
    });
  }

  // =========================================================================
  // 3. SALES RETURNS & REFUNDS (نظام المرتجعات والإشعارات الدائنة)
  // =========================================================================

  /**
   * معالجة مرتجع مبيعات (كامل أو جزئي) وإعادة القطع الصالحة للمخزون
   */
  processSaleReturn({
    sale_id,
    items = [], // [{ sale_item_id, return_quantity, condition: 'GOOD'|'DAMAGED', notes }]
    reason = 'مرتجع مبيعات بطلب العميل',
    refund_amount = null
  }) {
    if (!sale_id) throw new Error('معرف الفاتورة الأصلية مطلوب.');
    if (!items || items.length === 0) throw new Error('يرجى تحديد الأصناف المراد إرجاعها.');

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Get original sale
      const sale = tDb.prepare('SELECT * FROM sales WHERE id = ?').get(sale_id);
      if (!sale) throw new Error(`عملية البيع رقم [${sale_id}] غير موجودة.`);

      // 2. Fetch original items and previously returned quantities
      let totalCalculatedRefund = 0;
      const validatedReturns = [];

      for (const retItem of items) {
        const originalItem = tDb.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?').get(retItem.sale_item_id, sale_id);
        if (!originalItem) {
          throw new Error(`بند المبيعات #${retItem.sale_item_id} غير تابع لهذه الفاتورة.`);
        }

        // Check how much has already been returned
        const alreadyReturned = tDb.prepare(`
          SELECT COALESCE(SUM(quantity), 0) as qty
          FROM sale_return_items
          WHERE sale_item_id = ?
        `).get(retItem.sale_item_id).qty;

        const maxReturnable = originalItem.quantity - alreadyReturned;
        const returnQty = Number(retItem.return_quantity) || 1;

        if (returnQty <= 0 || returnQty > maxReturnable) {
          throw new Error(`الكمية المرتجعة [${returnQty}] تتجاوز الكمية المتبقية القابلة للإرجاع [${maxReturnable}].`);
        }

        const unitRefund = (originalItem.total_price / originalItem.quantity) * returnQty;
        totalCalculatedRefund += unitRefund;

        validatedReturns.push({
          sale_item_id: originalItem.id,
          product_variant_id: originalItem.product_variant_id,
          suit_unit_id: originalItem.suit_unit_id,
          quantity: returnQty,
          refund_amount: unitRefund,
          condition: retItem.condition || 'GOOD'
        });
      }

      const finalRefund = refund_amount !== null ? Number(refund_amount) : totalCalculatedRefund;
      const cashSession = this.financeRepo.getActiveCashSession() || { id: sale.cash_session_id };

      // 3. Create Return Record
      const returnNumber = `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
      const retRes = tDb.prepare(`
        INSERT INTO sales_returns (return_number, sale_id, total_refund, reason, cash_session_id, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(returnNumber, sale_id, finalRefund, reason, cashSession.id || null);
      const returnId = retRes.lastInsertRowid;

      // 4. Insert Return Items & Adjust Stock back
      const retItemStmt = tDb.prepare(`
        INSERT INTO sale_return_items (return_id, sale_item_id, quantity, refund_amount, condition)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const vr of validatedReturns) {
        retItemStmt.run(returnId, vr.sale_item_id, vr.quantity, vr.refund_amount, vr.condition);

        if (vr.product_variant_id) {
          if (vr.condition === 'GOOD') {
            // Restore quantity in default warehouse
            tDb.prepare(`
              UPDATE stock_balances
              SET quantity_on_hand = quantity_on_hand + ?,
                  updated_at = datetime('now')
              WHERE warehouse_id = 1 AND product_variant_id = ?
            `).run(vr.quantity, vr.product_variant_id);

            tDb.prepare(`
              INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, reference_id, notes)
              VALUES (1, ?, 'SALE_RETURN', ?, 'SALE_RETURN', ?, ?)
            `).run(vr.product_variant_id, vr.quantity, returnId, `مرتجع مبيعات إشعار #${returnNumber}`);
          } else {
            // Damaged goods movement
            tDb.prepare(`
              INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, reference_id, notes)
              VALUES (1, ?, 'DAMAGE', ?, 'SALE_RETURN_DAMAGED', ?, ?)
            `).run(vr.product_variant_id, -vr.quantity, returnId, `مرتجع مبيعات تالف #${returnNumber}`);
          }
        } else if (vr.suit_unit_id) {
          const newStatus = vr.condition === 'GOOD' ? 'AVAILABLE' : 'DAMAGED';
          tDb.prepare('UPDATE suit_units SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, vr.suit_unit_id);

          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, 'SOLD', ?, 'مرتجع بيع بدلة', 'SALE_RETURN', ?)
          `).run(vr.suit_unit_id, newStatus, returnId);
        }
      }

      // 5. Create Return Invoice (Credit Note)
      const invNumber = `INV-RET-${Date.now().toString().slice(-8)}`;
      tDb.prepare(`
        INSERT INTO invoices (invoice_number, invoice_type, reference_id, customer_id, subtotal, discount, total, paid, due, created_at)
        VALUES (?, 'RETURN', ?, ?, ?, 0, ?, ?, 0, datetime('now'))
      `).run(invNumber, returnId, sale.customer_id, finalRefund, -finalRefund, -finalRefund);

      // 6. Record Cash Refund Outflow
      if (finalRefund > 0 && cashSession && cashSession.id) {
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
          VALUES (?, 'OUT', 'SALE', ?, 'SALE_RETURN', ?, ?)
        `).run(cashSession.id, finalRefund, returnId, `رد قيمة مرتجع مبيعات #${returnNumber}`);

        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_out = total_cash_out + ?,
              calculated_balance = calculated_balance - ?
          WHERE id = ?
        `).run(finalRefund, finalRefund, cashSession.id);
      }

      logger.info(`Sale Return processed: #${returnNumber} with refund: ${finalRefund} EGP`);
      return {
        success: true,
        returnId,
        returnNumber,
        totalRefund: finalRefund
      };
    });
  }

  // =========================================================================
  // 4. SALES QUERIES & DETAILS (استعلامات المبيعات وسجل الفواتير)
  // =========================================================================

  getSales({ search = '', limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT s.*,
             c.name as customer_name,
             c.phone as customer_phone,
             (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count,
             (SELECT COUNT(*) FROM sales_returns sr WHERE sr.sale_id = s.id) as return_count,
             (SELECT COALESCE(SUM(total_refund), 0) FROM sales_returns sr WHERE sr.sale_id = s.id) as total_refunded
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (s.sale_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.dbConn.all(sql, params);
  }

  getSaleDetails(saleId) {
    const sale = this.dbConn.get(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `, [saleId]);

    if (!sale) return null;

    const items = this.dbConn.all(`
      SELECT si.*,
             COALESCE(p.name, m.name) as item_name,
             COALESCE(p.code, m.code) as item_code,
             COALESCE(pv.barcode, u.unit_barcode) as barcode,
             COALESCE(s.name, su_s.name) as size_name,
             COALESCE(col.name, su_col.name) as color_name,
             (SELECT COALESCE(SUM(sri.quantity), 0) FROM sale_return_items sri WHERE sri.sale_item_id = si.id) as returned_quantity
      FROM sale_items si
      LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN colors col ON pv.color_id = col.id
      LEFT JOIN suit_units u ON si.suit_unit_id = u.id
      LEFT JOIN suit_models m ON u.suit_model_id = m.id
      LEFT JOIN sizes su_s ON u.size_id = su_s.id
      LEFT JOIN colors su_col ON m.color_id = su_col.id
      WHERE si.sale_id = ?
    `, [saleId]);

    const returns = this.dbConn.all(`
      SELECT sr.*,
             (SELECT COUNT(*) FROM sale_return_items sri WHERE sri.return_id = sr.id) as item_count
      FROM sales_returns sr
      WHERE sr.sale_id = ?
      ORDER BY sr.id DESC
    `, [saleId]);

    const invoice = this.dbConn.get(`
      SELECT * FROM invoices WHERE reference_id = ? AND invoice_type = 'SALE' LIMIT 1
    `, [saleId]);

    return { ...sale, items, returns, invoice };
  }
}

const posSalesService = new PosSalesService();

module.exports = {
  PosSalesService,
  posSalesService
};

