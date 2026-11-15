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
             (SELECT COUNT(*) FROM suit_units u WHERE u.suit_model_id = m.id AND u.status = 'AVAILABLE') as available_units,
             (SELECT GROUP_CONCAT(s_name || ' (' || cnt || ')', ' | ')
              FROM (
                SELECT s2.name as s_name, COUNT(*) as cnt
                FROM suit_units u2
                JOIN sizes s2 ON u2.size_id = s2.id
                WHERE u2.suit_model_id = m.id AND u2.status != 'RETIRED'
                GROUP BY s2.id
                ORDER BY s2.sort_order ASC
              )
             ) as sizes_detail
      FROM suit_models m
      JOIN categories c ON m.category_id = c.id
      LEFT JOIN colors col ON m.color_id = col.id
      ${onlyActive ? 'WHERE m.is_active = 1' : ''}
      ORDER BY m.id DESC
    `;
    return this.dbConn.all(sql);
  }

  createSuitModel({ code, name, category_id = 1, brand = '', color_id = null, sale_price = 0, rental_price = 0, cost_price = 0, security_deposit = 0, description = '' }) {
    if (!code || !name) throw new Error('كود الموديل واسم البدلة مطلوبان.');
    if (!cost_price || Number(cost_price) <= 0) {
      throw new Error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر.');
    }
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO suit_models (category_id, code, name, brand, color_id, sale_price, rental_price, cost_price, security_deposit, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const res = stmt.run(category_id, code.trim().toUpperCase(), name.trim(), brand.trim(), color_id, Number(sale_price) || 0, Number(rental_price) || 0, Number(cost_price) || 0, Number(security_deposit) || 0, description.trim());
    logger.info(`Created Suit Model: ${name} (${code})`);
    return { id: res.lastInsertRowid, code, name, rental_price, sale_price, cost_price, security_deposit };
  }

  updateSuitModel(id, payload) {
    const { code, name, category_id, rental_price, security_deposit, sale_price, cost_price, description, color_id } = payload;
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      UPDATE suit_models
      SET code = COALESCE(?, code),
          name = COALESCE(?, name),
          category_id = COALESCE(?, category_id),
          rental_price = COALESCE(?, rental_price),
          security_deposit = COALESCE(?, security_deposit),
          sale_price = COALESCE(?, sale_price),
          cost_price = COALESCE(?, cost_price),
          description = COALESCE(?, description),
          color_id = COALESCE(?, color_id)
      WHERE id = ?
    `);
    stmt.run(
      code ? code.trim().toUpperCase() : null,
      name ? name.trim() : null,
      category_id || null,
      rental_price !== undefined && rental_price !== null ? Number(rental_price) : null,
      security_deposit !== undefined && security_deposit !== null ? Number(security_deposit) : null,
      sale_price !== undefined && sale_price !== null ? Number(sale_price) : null,
      cost_price !== undefined && cost_price !== null ? Number(cost_price) : null,
      description !== undefined ? description : null,
      color_id || null,
      Number(id)
    );
    logger.info(`Updated Suit Model ID: ${id}`);
    return true;
  }

  deleteSuitModel(id) {
    const db = this.dbConn.getDb();
    const activeUnits = db.prepare("SELECT COUNT(*) as count FROM suit_units WHERE suit_model_id = ? AND status IN ('BOOKED', 'IN_USE')").get(Number(id));
    if (activeUnits && activeUnits.count > 0) {
      throw new Error(`لا يمكن حذف الموديل لأن لديه (${activeUnits.count}) قطع محجوزة أو مسلّمة لعملاء حالياً.`);
    }
    return TransactionHelper.runInTransaction(db, (tDb) => {
      tDb.prepare("UPDATE suit_units SET status = 'RETIRED' WHERE suit_model_id = ?").run(Number(id));
      tDb.prepare("UPDATE suit_models SET is_active = 0 WHERE id = ?").run(Number(id));
      logger.info(`Soft-deleted Suit Model ID: ${id}`);
      return true;
    });
  }

  getSuitUnits(filters = {}) {
    let sql = `
      SELECT u.*, m.name as model_name, m.code as model_code, m.rental_price, m.security_deposit,
             s.name as size_name, s.code as size_code, w.name as warehouse_name, col.name as color_name,
             (SELECT b.booking_number FROM booking_items bi JOIN bookings b ON bi.booking_id = b.id WHERE bi.suit_unit_id = u.id AND b.status NOT IN ('CANCELLED', 'COMPLETED') ORDER BY b.id DESC LIMIT 1) as active_booking_number,
             (SELECT c.name FROM booking_items bi JOIN bookings b ON bi.booking_id = b.id JOIN customers c ON b.customer_id = c.id WHERE bi.suit_unit_id = u.id AND b.status NOT IN ('CANCELLED', 'COMPLETED') ORDER BY b.id DESC LIMIT 1) as active_customer_name,
             (SELECT b.status FROM booking_items bi JOIN bookings b ON bi.booking_id = b.id WHERE bi.suit_unit_id = u.id AND b.status NOT IN ('CANCELLED', 'COMPLETED') ORDER BY b.id DESC LIMIT 1) as active_booking_status
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
    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'BOOKED') {
        sql += " AND (u.status IN ('BOOKED', 'IN_USE') OR (SELECT 1 FROM booking_items bi JOIN bookings b ON bi.booking_id = b.id WHERE bi.suit_unit_id = u.id AND b.status NOT IN ('CANCELLED', 'COMPLETED')) IS NOT NULL)";
      } else if (filters.status === 'BOOKED_ONLY') {
        sql += " AND u.status = 'BOOKED'";
      } else {
        sql += ' AND u.status = ?';
        params.push(filters.status);
      }
    } else if (!filters.includeRetired) {
      sql += " AND u.status != 'RETIRED'";
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

      let finalCost = Number(purchase_cost) || 0;
      if (finalCost <= 0) {
        const m = tDb.prepare('SELECT cost_price FROM suit_models WHERE id = ?').get(suit_model_id);
        if (m && m.cost_price > 0) finalCost = m.cost_price;
      }

      const stmt = tDb.prepare(`
        INSERT INTO suit_units (suit_model_id, size_id, warehouse_id, unit_barcode, serial_number, status, rental_count, purchase_cost, notes)
        VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 0, ?, ?)
      `);
      const res = stmt.run(suit_model_id, size_id, warehouse_id, barcode, serial_number, finalCost, notes);
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

  createSuitUnitsBatch({ suit_model_id, warehouse_id = 1, purchase_cost = 0, sizeQuantities = [] }) {
    if (!suit_model_id) throw new Error('موديل البدلة مطلوب.');
    if (!sizeQuantities || sizeQuantities.length === 0) {
      throw new Error('يرجى تحديد المقاسات والكميات.');
    }

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      let finalCost = Number(purchase_cost) || 0;
      if (finalCost <= 0) {
        const m = tDb.prepare('SELECT cost_price FROM suit_models WHERE id = ?').get(suit_model_id);
        if (m && m.cost_price > 0) finalCost = m.cost_price;
      }

      const m = tDb.prepare('SELECT code FROM suit_models WHERE id = ?').get(suit_model_id);
      const modelCode = m ? m.code : 'SUIT';

      const insertStmt = tDb.prepare(`
        INSERT INTO suit_units (suit_model_id, size_id, warehouse_id, unit_barcode, status, rental_count, purchase_cost, notes)
        VALUES (?, ?, ?, ?, 'AVAILABLE', 0, ?, 'إضافة دفعة بالمقاسات')
      `);

      const histStmt = tDb.prepare(`
        INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason)
        VALUES (?, NULL, 'AVAILABLE', 'إضافة البدلة للمخزن لأول مرة')
      `);

      let totalCreated = 0;
      const createdUnits = [];

      for (const item of sizeQuantities) {
        const sizeId = Number(item.size_id);
        const qty = Number(item.quantity) || 0;
        if (!sizeId || qty <= 0) continue;

        for (let i = 0; i < qty; i++) {
          const randSuffix = Math.floor(1000 + Math.random() * 9000);
          const barcode = `ST-${modelCode}-${sizeId}-${Date.now().toString().slice(-4)}${randSuffix}`;
          const res = insertStmt.run(suit_model_id, sizeId, warehouse_id, barcode, finalCost);
          const unitId = res.lastInsertRowid;
          histStmt.run(unitId);
          createdUnits.push({ id: unitId, barcode, size_id: sizeId });
          totalCreated++;
        }
      }

      logger.info(`Batch created ${totalCreated} Suit Units for model #${suit_model_id}`);
      return { success: true, count: totalCreated, units: createdUnits };
    });
  }

  updateSuitUnit(id, payload) {
    const { size_id, warehouse_id, unit_barcode, purchase_cost, notes } = payload;
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      UPDATE suit_units
      SET size_id = COALESCE(?, size_id),
          warehouse_id = COALESCE(?, warehouse_id),
          unit_barcode = COALESCE(?, unit_barcode),
          purchase_cost = COALESCE(?, purchase_cost),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `);
    stmt.run(
      size_id ? Number(size_id) : null,
      warehouse_id ? Number(warehouse_id) : null,
      unit_barcode ? unit_barcode.trim() : null,
      purchase_cost !== undefined && purchase_cost !== null ? Number(purchase_cost) : null,
      notes !== undefined ? notes : null,
      Number(id)
    );
    logger.info(`Updated Suit Unit ID: ${id}`);
    return true;
  }

  deleteSuitUnit(id) {
    const targetId = Number(id);
    const db = this.dbConn.getDb();
    const unit = db.prepare("SELECT status FROM suit_units WHERE id = ?").get(targetId);
    if (!unit) throw new Error('قطعة البدلة غير موجودة.');
    if (unit.status === 'BOOKED' || unit.status === 'IN_USE') {
      throw new Error('لا يمكن حذف قطعة مؤجرة أو محجوزة لعميل حالياً.');
    }

    return TransactionHelper.runInTransaction(db, (tDb) => {
      const usedInBooking = tDb.prepare("SELECT COUNT(*) as count FROM booking_items WHERE suit_unit_id = ?").get(targetId);
      const usedInSale = tDb.prepare("SELECT COUNT(*) as count FROM sale_items WHERE suit_unit_id = ?").get(targetId);
      const hasHistory = (usedInBooking && usedInBooking.count > 0) || (usedInSale && usedInSale.count > 0);

      if (hasHistory) {
        tDb.prepare("UPDATE suit_units SET status = 'RETIRED', updated_at = datetime('now') WHERE id = ?").run(targetId);
      } else {
        tDb.prepare("DELETE FROM unit_status_history WHERE suit_unit_id = ?").run(targetId);
        tDb.prepare("DELETE FROM cleaning_records WHERE suit_unit_id = ?").run(targetId);
        tDb.prepare("DELETE FROM maintenance_records WHERE suit_unit_id = ?").run(targetId);
        tDb.prepare("DELETE FROM tasks WHERE suit_unit_id = ?").run(targetId);
        tDb.prepare("DELETE FROM suit_units WHERE id = ?").run(targetId);
      }
      logger.info(`Deleted Suit Unit ID: ${targetId}`);
      return true;
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

  getQuantityProducts(filter = null) {
    let sql = `
      SELECT p.*, c.name as category_name, c.type as category_type, c.code as category_code,
             COALESCE(SUM(b.quantity_on_hand), 0) as total_quantity,
             COALESCE(SUM(b.quantity_reserved), 0) as reserved_quantity,
             (COALESCE(SUM(b.quantity_on_hand), 0) - COALESCE(SUM(b.quantity_reserved), 0)) as available_quantity,
             GROUP_CONCAT(DISTINCT s.name) as sizes_summary,
             (SELECT GROUP_CONCAT(s_name || ' (' || total_qty || ')', ' | ')
              FROM (
                SELECT s2.name as s_name, COALESCE(SUM(b2.quantity_on_hand), 0) as total_qty
                FROM product_variants pv2
                JOIN sizes s2 ON pv2.size_id = s2.id
                LEFT JOIN stock_balances b2 ON b2.product_variant_id = pv2.id
                WHERE pv2.product_id = p.id AND pv2.is_active = 1
                GROUP BY s2.id
                ORDER BY s2.sort_order ASC
              )
             ) as sizes_detail,
             MIN(s.name) as size_name,
             MIN(s.code) as size_code,
             MIN(s.id) as size_id
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN stock_balances b ON b.product_variant_id = pv.id
      WHERE p.is_active = 1
    `;
    const params = [];
    if (filter) {
      const fVal = (typeof filter === 'object' && filter !== null) ? (filter.categoryType || filter.categoryId || filter.category_id || filter.code) : filter;
      if (fVal) {
        const norm = String(fVal).trim().toUpperCase();
        if (norm === 'ACCESSORIES' || norm === 'ACCESSORY' || norm === 'TIES') {
          sql += " AND (UPPER(c.type) = 'ACCESSORIES' OR UPPER(c.code) = 'ACCESSORIES' OR UPPER(c.code) = 'TIES')";
        } else if (norm === 'SHOES' || norm === 'SHOE') {
          sql += " AND (UPPER(c.type) = 'SHOES' OR UPPER(c.code) = 'SHOES' OR UPPER(c.code) = 'SHOE')";
        } else if (norm === 'SUITS' || norm === 'SUIT') {
          sql += " AND (UPPER(c.type) = 'SUITS' OR UPPER(c.code) = 'SUITS' OR UPPER(c.code) = 'SUIT')";
        } else {
          sql += ' AND (c.type = ? OR c.code = ? OR c.name = ? OR c.id = ?)';
          params.push(String(fVal), String(fVal), String(fVal), Number(fVal) || -1);
        }
      }
    }
    sql += ' GROUP BY p.id ORDER BY p.id DESC';
    return this.dbConn.all(sql, params);
  }

  createQuantityProduct(payload) {
    let { code, name, category_id, category_type, category_name, size_id, sale_price = 0, rental_price = 0, cost_price = 0, total_quantity = 0, reorder_level = 2, description = '', variants = [] } = payload;

    const db = this.dbConn.getDb();

    // Resolve category_id if not explicitly provided
    if (!category_id) {
      const match = db.prepare('SELECT id FROM categories WHERE id = ? OR code = ? OR name = ? OR type = ? LIMIT 1')
        .get(category_id || -1, category_type || '', category_name || '', category_type || '');
      if (match) {
        category_id = match.id;
      } else {
        const first = db.prepare('SELECT id FROM categories LIMIT 1').get();
        category_id = first ? first.id : 1;
      }
    }

    if (!code) {
      const seq = (db.prepare('SELECT COUNT(*) as c FROM products').get()?.c || 0) + 1;
      code = `PRD-${String(seq).padStart(4, '0')}`;
    }

    if (!name) throw new Error('اسم الصنف مطلوب.');
    if (!cost_price || Number(cost_price) <= 0) {
      throw new Error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر.');
    }

    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Create product
      const pStmt = tDb.prepare(`
        INSERT INTO products (category_id, code, name, description, sale_price, rental_price, cost_price, reorder_level, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const pRes = pStmt.run(category_id, code.trim().toUpperCase(), name.trim(), description, sale_price, rental_price, cost_price, reorder_level);
      const productId = pRes.lastInsertRowid;

      const targetWarehouse = payload.warehouse_id ? Number(payload.warehouse_id) : 1;

      // 2. Create variants and default balances
      const vStmt = tDb.prepare(`
        INSERT INTO product_variants (product_id, size_id, color_id, sku, barcode, additional_price, is_active)
        VALUES (?, ?, ?, ?, ?, 0, 1)
      `);
      const bStmt = tDb.prepare(`
        INSERT INTO stock_balances (warehouse_id, product_variant_id, quantity_on_hand, quantity_reserved)
        VALUES (?, ?, ?, 0)
      `);

      let effectiveVariants = [];
      if (variants && variants.length > 0) {
        effectiveVariants = variants;
      } else if (size_id) {
        effectiveVariants = [{
          size_id: Number(size_id),
          color_id: payload.color_id || null,
          sku: code,
          barcode: code,
          initial_quantity: total_quantity || 0
        }];
      } else {
        effectiveVariants = [{
          size_id: null,
          color_id: null,
          sku: code,
          barcode: code,
          initial_quantity: total_quantity || 0
        }];
      }

      for (let idx = 0; idx < effectiveVariants.length; idx++) {
        const v = effectiveVariants[idx];
        const vSuffix = v.size_id ? String(v.size_id) : (idx > 0 ? String(idx + 1) : 'U');
        const sku = v.sku || `${code}-${vSuffix}`;
        const barcode = v.barcode || sku;
        const vRes = vStmt.run(productId, v.size_id || null, v.color_id || null, sku, barcode);
        const variantId = vRes.lastInsertRowid;

        const initialQty = Number(v.initial_quantity) || 0;
        bStmt.run(targetWarehouse, variantId, initialQty);

        if (initialQty > 0) {
          tDb.prepare(`
            INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, notes)
            VALUES (?, ?, 'PURCHASE', ?, 'INITIAL_STOCK', 'رصيد افتتاحي للصنف')
          `).run(targetWarehouse, variantId, initialQty);
        }
      }

      const totalCreatedQty = effectiveVariants.reduce((sum, v) => sum + (Number(v.initial_quantity) || 0), 0);
      logger.info(`Created Quantity Product: ${name} (${code}) with ${effectiveVariants.length} size variants, total: ${totalCreatedQty}`);
      return { id: productId, code, name, total_quantity: totalCreatedQty };
    });
  }

  updateQuantityProduct(id, payload) {
    const { code, name, category_id, sale_price, rental_price, cost_price, reorder_level, description } = payload;
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      UPDATE products
      SET code = COALESCE(?, code),
          name = COALESCE(?, name),
          category_id = COALESCE(?, category_id),
          sale_price = COALESCE(?, sale_price),
          rental_price = COALESCE(?, rental_price),
          cost_price = COALESCE(?, cost_price),
          reorder_level = COALESCE(?, reorder_level),
          description = COALESCE(?, description)
      WHERE id = ?
    `);
    stmt.run(
      code ? code.trim().toUpperCase() : null,
      name ? name.trim() : null,
      category_id || null,
      sale_price !== undefined && sale_price !== null ? Number(sale_price) : null,
      rental_price !== undefined && rental_price !== null ? Number(rental_price) : null,
      cost_price !== undefined && cost_price !== null ? Number(cost_price) : null,
      reorder_level !== undefined && reorder_level !== null ? Number(reorder_level) : null,
      description !== undefined ? description : null,
      Number(id)
    );
    if (payload.size_id !== undefined) {
      db.prepare(`UPDATE product_variants SET size_id = ? WHERE product_id = ?`).run(
        payload.size_id ? Number(payload.size_id) : null,
        Number(id)
      );
    }
    logger.info(`Updated Quantity Product ID: ${id}`);
    return true;
  }

  deleteQuantityProduct(id) {
    const db = this.dbConn.getDb();
    const res = db.prepare(`
      SELECT SUM(sb.quantity_reserved) as reserved
      FROM stock_balances sb
      JOIN product_variants pv ON sb.product_variant_id = pv.id
      WHERE pv.product_id = ?
    `).get(Number(id));
    if (res && res.reserved > 0) {
      throw new Error('لا يمكن حذف هذا الصنف لوجود كميات محجوزة منه في حجوزات نشطة.');
    }
    db.prepare("UPDATE products SET is_active = 0 WHERE id = ?").run(Number(id));
    logger.info(`Soft-deleted Quantity Product ID: ${id}`);
    return true;
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

  getProductVariants(productId) {
    const db = this.dbConn.getDb();
    return db.prepare(`
      SELECT pv.id as variant_id, pv.product_id, pv.size_id, s.name as size_name, s.code as size_code,
             sb.warehouse_id, w.name as warehouse_name,
             COALESCE(sb.quantity_on_hand, 0) as quantity_on_hand,
             COALESCE(sb.quantity_reserved, 0) as quantity_reserved,
             (COALESCE(sb.quantity_on_hand, 0) - COALESCE(sb.quantity_reserved, 0)) as available_quantity
      FROM product_variants pv
      LEFT JOIN sizes s ON pv.size_id = s.id
      LEFT JOIN stock_balances sb ON sb.product_variant_id = pv.id
      LEFT JOIN warehouses w ON sb.warehouse_id = w.id
      WHERE pv.product_id = ? AND pv.is_active = 1
      ORDER BY s.sort_order ASC, pv.id ASC
    `).all(productId);
  }

  // =========================================================================
  // 3. STOCK ADJUSTMENTS & TRANSFERS WITH ZERO NEGATIVE INVENTORY
  // =========================================================================

  adjustStock(variantId, warehouseId, deltaQty, reason = 'تسوية جرد', notes = '') {
    if (deltaQty === 0) return true;

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      let targetVariantId = variantId;
      const vExists = tDb.prepare('SELECT id FROM product_variants WHERE id = ?').get(variantId);
      if (!vExists) {
        const pv = tDb.prepare('SELECT id FROM product_variants WHERE product_id = ? ORDER BY id ASC LIMIT 1').get(variantId);
        if (pv) targetVariantId = pv.id;
      }

      // 1. Get or create stock balance row
      let balance = tDb.prepare('SELECT * FROM stock_balances WHERE warehouse_id = ? AND product_variant_id = ?').get(warehouseId, targetVariantId);

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
      `).run(newOnHand, warehouseId, targetVariantId);

      // 3. Write immutable stock movement ledger entry
      const movType = deltaQty > 0 ? 'ADJUSTMENT' : 'ADJUSTMENT_OUT';
      tDb.prepare(`
        INSERT INTO stock_movements (warehouse_id, product_variant_id, movement_type, quantity, reference_type, notes)
        VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?)
      `).run(warehouseId, targetVariantId, movType, deltaQty, `${reason} - ${notes}`);

      logger.info(`Stock adjusted for variant #${targetVariantId} in wh #${warehouseId}: delta=${deltaQty}, newBalance=${newOnHand}`);
      return { variantId: targetVariantId, warehouseId, newOnHand, newAvailable };
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

