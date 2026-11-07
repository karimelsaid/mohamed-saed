const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { logger } = require('../logging/logger');

class InventoryEngineService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  // =========================================================================
  // 1. INDIVIDUAL INVENTORY: SUIT MODELS & UNIQUE UNITS (المخزون الفردي للبدل)
  // =========================================================================

  getSuitModels(onlyActive = true) {
    const sql = `
      SELECT m.*, c.name as category_name, col.name as color_name, col.hex_code,
             (SELECT COUNT(*) FROM suit_units u WHERE u.suit_model_id = m.id AND u.status != 'RETIRED') as total_units,
             (SELECT COUNT(*) FROM suit_units u WHERE u.suit_model_id = m.id AND u.status = 'AVAILABLE') as available_units
      FROM suit_models m
      JOIN categories c ON m.category_id = c.id
      LEFT JOIN colors col ON m.color_id = col.id
      ${onlyActive ? 'WHERE m.is_active = 1' : ''}
      ORDER BY m.id DESC
    `;
    return this.dbConn.all(sql);
  }

  createSuitModel({ code, name, category_id = 1, brand = '', color_id = null, sale_price = 0, rental_price = 0, security_deposit = 0, description = '' }) {
    if (!code || !name) throw new Error('كود الموديل واسم البدلة مطلوبان.');
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO suit_models (category_id, code, name, brand, color_id, sale_price, rental_price, security_deposit, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const res = stmt.run(category_id, code.trim().toUpperCase(), name.trim(), brand.trim(), color_id, sale_price, rental_price, security_deposit, description.trim());
    logger.info(`Created Suit Model: ${name} (${code})`);
    return { id: res.lastInsertRowid, code, name, rental_price, security_deposit };
  }

  getSuitUnits(filters = {}) {
    let sql = `
      SELECT u.*, m.name as model_name, m.code as model_code, m.rental_price, m.security_deposit,
             s.name as size_name, s.code as size_code, w.name as warehouse_name, col.name as color_name
      FROM suit_units u
      JOIN suit_models m ON u.suit_model_id = m.id
      JOIN sizes s ON u.size_id = s.id
      JOIN warehouses w ON u.warehouse_id = w.id
      LEFT JOIN colors col ON m.color_id = col.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.modelId) {
      sql += ' AND u.suit_model_id = ?';
      params.push(filters.modelId);
    }
    if (filters.status) {
      sql += ' AND u.status = ?';
      params.push(filters.status);
    }
    if (filters.warehouseId) {
      sql += ' AND u.warehouse_id = ?';
      params.push(filters.warehouseId);
    }
    if (filters.search) {
      sql += ' AND (u.unit_barcode LIKE ? OR m.name LIKE ? OR u.serial_number LIKE ?)';
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY u.id DESC';
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.dbConn.all(sql, params);
  }

  createSuitUnit({ suit_model_id, size_id, warehouse_id = 1, unit_barcode = null, serial_number = null, purchase_cost = 0, notes = '' }) {
    if (!suit_model_id || !size_id) throw new Error('موديل البدلة والمقاس مطلوبان لإنشاء الوحدة.');

    // Auto generate barcode if not provided: SUIT-<model_id>-<size_id>-<random>
    const barcode = unit_barcode ? unit_barcode.trim() : `ST-${suit_model_id}-${size_id}-${Date.now().toString().slice(-5)}`;
    const db = this.dbConn.getDb();

    return TransactionHelper.runInTransaction(db, (tDb) => {
      // Check duplicate barcode
      const existing = tDb.prepare('SELECT id FROM suit_units WHERE unit_barcode = ?').get(barcode);
      if (existing) {
        throw new Error(`الباركود [${barcode}] مستخدم بالفعل لوحدة أخرى. يجب أن يكون فريداً.`);
      }

      const stmt = tDb.prepare(`
        INSERT INTO suit_units (suit_model_id, size_id, warehouse_id, unit_barcode, serial_number, status, rental_count, purchase_cost, notes)
        VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 0, ?, ?)
      `);
      const res = stmt.run(suit_model_id, size_id, warehouse_id, barcode, serial_number, purchase_cost, notes);
      const unitId = res.lastInsertRowid;

      // Log initial status
      tDb.prepare(`
        INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason)
        VALUES (?, NULL, 'AVAILABLE', 'إضافة البدلة للمخزن لأول مرة')
      `).run(unitId);

      logger.info(`Created Suit Unit ID ${unitId} with barcode [${barcode}]`);
      return { id: unitId, barcode, status: 'AVAILABLE' };
    });
  }

  updateUnitStatus(unitId, newStatus, reason = '', refType = null, refId = null) {
    const validStatuses = ['AVAILABLE', 'BOOKED', 'IN_USE', 'IN_CLEANING', 'IN_MAINTENANCE', 'DAMAGED', 'RETIRED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`حالة غير صالحة: ${newStatus}`);
    }

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const current = tDb.prepare('SELECT status FROM suit_units WHERE id = ?').get(unitId);
      if (!current) throw new Error(`الوحدة رقم #${unitId} غير موجودة.`);

      if (current.status === newStatus) return true; // No change

      tDb.prepare(`
        UPDATE suit_units
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, unitId);

      tDb.prepare(`
        INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(unitId, current.status, newStatus, reason, refType, refId);

      logger.info(`Updated Suit Unit #${unitId} status: ${current.status} -> ${newStatus} (${reason})`);
      return true;
    });
  }

  getUnitHistory(unitId) {
    const sql = `
      SELECT * FROM unit_status_history
      WHERE suit_unit_id = ?
      ORDER BY id DESC
    `;
    return this.dbConn.all(sql, [unitId]);
  }

  // --- Cleaning & Laundry Lifecycle ---
  sendUnitToCleaning(unitId, cleanerName, expectedReturnDate = null, cost = 0, notes = '') {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Update unit status
      this.updateUnitStatus(unitId, 'IN_CLEANING', `إرسال للدراي كلين: ${cleanerName}`);

      // 2. Insert cleaning record
      const stmt = tDb.prepare(`
        INSERT INTO cleaning_records (suit_unit_id, cleaner_name, sent_date, expected_return_date, cost, status, notes)
        VALUES (?, ?, date('now'), ?, ?, 'IN_CLEANING', ?)
      `);
      const res = stmt.run(unitId, cleanerName, expectedReturnDate, cost, notes);
      logger.info(`Sent Unit #${unitId} to cleaning: ${cleanerName}`);
      return { cleaningRecordId: res.lastInsertRowid, status: 'IN_CLEANING' };
    });
  }

  returnUnitFromCleaning(cleaningRecordId, actualCost = null, notes = '') {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const rec = tDb.prepare('SELECT * FROM cleaning_records WHERE id = ?').get(cleaningRecordId);
      if (!rec || rec.status !== 'IN_CLEANING') {
        throw new Error('سجل الغسيل غير موجود أو تم استلامه مسبقًا.');
      }

      tDb.prepare(`
        UPDATE cleaning_records
        SET actual_return_date = date('now'),
            cost = COALESCE(?, cost),
            status = 'RETURNED',
            notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(actualCost, notes, cleaningRecordId);

      this.updateUnitStatus(rec.suit_unit_id, 'AVAILABLE', 'استلام البدلة جاهزة ونظيفة من المغسلة');
      logger.info(`Unit #${rec.suit_unit_id} returned from cleaning.`);
      return true;
    });
  }

  // =========================================================================
  // 2. QUANTITY INVENTORY: SHOES & ACCESSORIES (المخزون الكمي للأحذية والإكسسوار)
  // =========================================================================

  getQuantityProducts(categoryType = null) {
    let sql = `
      SELECT p.*, c.name as category_name, c.type as category_type,
             COALESCE(SUM(b.quantity_on_hand), 0) as total_quantity,
             COALESCE(SUM(b.quantity_reserved), 0) as reserved_quantity,
             (COALESCE(SUM(b.quantity_on_hand), 0) - COALESCE(SUM(b.quantity_reserved), 0)) as available_quantity
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id
      WHERE p.is_active = 1
    `;
    const params = [];
    if (categoryType) {
      sql += ' AND c.type = ?';
      params.push(categoryType);
    }
    sql += ' GROUP BY p.id ORDER BY p.id DESC';
    return this.dbConn.all(sql, params);
  }

  createQuantityProduct({ code, name, category_id, sale_price = 0, rental_price = 0, cost_price = 0, reorder_level = 2, description = '', variants = [] }) {
    if (!code || !name || !category_id) throw new Error('الكود والاسم والفئة حقول مطلوبة.');

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Create product
      const pStmt = tDb.prepare(`
        INSERT INTO products (category_id, code, name, description, sale_price, rental_price, cost_price, reorder_level, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const pRes = pStmt.run(category_id, code.trim().toUpperCase(), name.trim(), description, sale_price, rental_price, cost_price, reorder_level);
      const productId = pRes.lastInsertRowid;

      // 2. Create variants and default balances
      const vStmt = tDb.prepare(`
        INSERT INTO product_variants (product_id, size_id, color_id, sku, barcode, additional_price, is_active)
        VALUES (?, ?, ?, ?, ?, 0, 1)
      `);
      const bStmt = tDb.prepare(`
        INSERT INTO stock_balances (warehouse_id, product_variant_id, quantity_on_hand, quantity_reserved)
        VALUES (1, ?, ?, 0)
      `);

      for (const v of variants) {
        const sku = v.sku || `${code}-${v.size_id || 'U'}-${v.color_id || 'U'}`;
        const vRes = vStmt.run(productId, v.size_id || null, v.color_id || null, sku, v.barcode || sku);
        const variantId = vRes.lastInsertRowid;

        const initialQty = Number(v.initial_quantity) || 0;
        bStmt.run(variantId, initialQty);

        if (initialQty > 0) {
          tDb.prepare(`
            INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, notes)
            VALUES (1, ?, 'PURCHASE', ?, 'INITIAL_STOCK', 'رصيد افتتاحي للصنف')
          `).run(variantId, initialQty);
        }
      }

      logger.info(`Created Quantity Product: ${name} (${code}) with ${variants.length} variants`);
      return { id: productId, code, name };
    });
  }

  getProductVariants(productId) {
    const sql = `
      SELECT pv.*, s.name as size_name, s.code as size_code, col.name as color_name,
             COALESCE(b.quantity_on_hand, 0) as quantity_on_hand,
             COALESCE(b.quantity_reserved, 0) as quantity_reserved,
             (COALESCE(b.quantity_on_hand, 0) - COALESCE(b.quantity_reserved, 0)) as available_quantity,
             w.name as warehouse_name
      FROM product_variants pv
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN colors col ON pv.color_id = col.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id
      LEFT JOIN warehouses w ON b.warehouse_id = w.id
      WHERE pv.product_id = ? AND pv.is_active = 1
      ORDER BY s.sort_order ASC, pv.id ASC
    `;
    return this.dbConn.all(sql, [productId]);
  }

  // =========================================================================
  // 3. STOCK ADJUSTMENTS & TRANSFERS WITH ZERO NEGATIVE INVENTORY
  // =========================================================================

  adjustStock(variantId, warehouseId, deltaQty, reason = 'تسوية جرد', notes = '') {
    if (deltaQty === 0) return true;

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Get or create stock balance row
      let balance = tDb.prepare('SELECT * FROM stock_balances WHERE warehouse_id = ? AND product_variant_id = ?').get(warehouseId, variantId);

      if (!balance) {
        tDb.prepare('INSERT INTO stock_balances (warehouse_id, product_variant_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0, 0)').run(warehouseId, variantId);
        balance = { quantity_on_hand: 0, quantity_reserved: 0 };
      }

      const newOnHand = balance.quantity_on_hand + deltaQty;
      const newAvailable = newOnHand - balance.quantity_reserved;

      // RULE: No negative available stock!
      if (newOnHand < 0 || newAvailable < 0) {
        throw new Error(`خطأ في تسوية المخزون: لا يمكن صرف كمية [${Math.abs(deltaQty)}] لأن الرصيد الحالي [${balance.quantity_on_hand}] غير كافٍ. ممنوع الرصيد بالسالب.`);
      }

      // 2. Update stock balance
      tDb.prepare(`
        UPDATE stock_balances
        SET quantity_on_hand = ?, updated_at = datetime('now')
        WHERE warehouse_id = ? AND product_variant_id = ?
      `).run(newOnHand, warehouseId, variantId);

      // 3. Write immutable stock movement ledger entry
      const movType = deltaQty > 0 ? 'ADJUSTMENT' : 'ADJUSTMENT_OUT';
      tDb.prepare(`
        INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, notes)
        VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?)
      `).run(warehouseId, variantId, movType, deltaQty, `${reason} - ${notes}`);

      logger.info(`Stock adjusted for variant #${variantId} in wh #${warehouseId}: delta=${deltaQty}, newBalance=${newOnHand}`);
      return { variantId, warehouseId, newOnHand, newAvailable };
    });
  }

  transferStock(variantId, fromWarehouseId, toWarehouseId, quantity, notes = '') {
    if (fromWarehouseId === toWarehouseId) {
      throw new Error('لا يمكن التحويل لنفس المخزن.');
    }
    if (quantity <= 0) {
      throw new Error('كمية التحويل يجب أن تكون أكبر من الصفر.');
    }

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Deduct from source warehouse (with negative check)
      this.adjustStock(variantId, fromWarehouseId, -quantity, 'تحويل مخزني صادر', `تحويل إلى مخزن #${toWarehouseId} - ${notes}`);

      // 2. Add to destination warehouse
      this.adjustStock(variantId, toWarehouseId, quantity, 'تحويل مخزني وارد', `استلام من مخزن #${fromWarehouseId} - ${notes}`);

      logger.info(`Transferred ${quantity} units of variant #${variantId} from wh #${fromWarehouseId} to #${toWarehouseId}`);
      return true;
    });
  }

  getStockLedger(filters = {}) {
    let sql = `
      SELECT sm.*, w.name as warehouse_name, pv.sku, p.name as product_name
      FROM stock_movements sm
      JOIN warehouses w ON sm.warehouse_id = w.id
      JOIN product_variants pv ON sm.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (filters.variantId) {
      sql += ' AND sm.product_variant_id = ?';
      params.push(filters.variantId);
    }
    if (filters.warehouseId) {
      sql += ' AND sm.warehouse_id = ?';
      params.push(filters.warehouseId);
    }
    sql += ' ORDER BY sm.id DESC LIMIT ?';
    params.push(filters.limit || 50);

    return this.dbConn.all(sql, params);
  }
}

const inventoryEngineService = new InventoryEngineService();
module.exports = { inventoryEngineService, InventoryEngineService };
