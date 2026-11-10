const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { logger } = require('../logging/logger');

class AdminService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  // --- 1. Categories (الأقسام والتصنيفات) ---
  getCategories(onlyActive = true) {
    const sql = onlyActive
      ? 'SELECT * FROM categories WHERE is_active = 1 ORDER BY id ASC'
      : 'SELECT * FROM categories ORDER BY id ASC';
    return this.dbConn.all(sql);
  }

  createCategory({ code, name, type = 'SUITS' }) {
    if (!code || !name) throw new Error('الكود واسم القسم مطلوبان.');
    const db = this.dbConn.getDb();
    const stmt = db.prepare('INSERT INTO categories (code, name, type, is_active) VALUES (?, ?, ?, 1)');
    const res = stmt.run(code.trim().toUpperCase(), name.trim(), type);
    logger.info(`Created category: ${name} (${code})`);
    return { id: res.lastInsertRowid, code, name, type, isActive: 1 };
  }

  updateCategory(id, { name, type, is_active }) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare('UPDATE categories SET name = COALESCE(?, name), type = COALESCE(?, type), is_active = COALESCE(?, is_active) WHERE id = ?');
    stmt.run(name ? name.trim() : null, type ? type.trim() : null, is_active !== undefined ? is_active : null, id);
    logger.info(`Updated category ID: ${id}`);
    return true;
  }

  deleteCategory(id) {
    const targetId = Number(id);
    const db = this.dbConn.getDb();
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(targetId);
    if (!cat) throw new Error('القسم غير موجود.');

    // Check if category is used in active/historical bookings or sales
    const bookingUsage = db.prepare(`
      SELECT COUNT(*) as count FROM booking_items bi
      WHERE bi.product_variant_id IN (
        SELECT pv.id FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE p.category_id = ?
      )
      OR bi.suit_unit_id IN (
        SELECT u.id FROM suit_units u
        JOIN suit_models sm ON u.suit_model_id = sm.id
        WHERE sm.category_id = ?
      )
    `).get(targetId, targetId);

    const saleUsage = db.prepare(`
      SELECT COUNT(*) as count FROM sale_items si
      WHERE si.product_variant_id IN (
        SELECT pv.id FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE p.category_id = ?
      )
      OR si.suit_unit_id IN (
        SELECT u.id FROM suit_units u
        JOIN suit_models sm ON u.suit_model_id = sm.id
        WHERE sm.category_id = ?
      )
    `).get(targetId, targetId);

    const isUsedInTransactions = (bookingUsage?.count > 0) || (saleUsage?.count > 0);

    return TransactionHelper.runInTransaction(db, (tDb) => {
      if (isUsedInTransactions) {
        // Soft delete category & products & models
        tDb.prepare("UPDATE categories SET is_active = 0 WHERE id = ?").run(targetId);
        tDb.prepare("UPDATE products SET is_active = 0 WHERE category_id = ?").run(targetId);
        tDb.prepare("UPDATE suit_models SET is_active = 0 WHERE category_id = ?").run(targetId);
        logger.info(`Soft-deleted category ID: ${targetId} due to existing transaction history`);
      } else {
        // Clean cascade hard delete:
        // 1. Delete associated products and their variants, balances, movements
        const products = tDb.prepare("SELECT id FROM products WHERE category_id = ?").all(targetId);
        for (const prod of products) {
          const variants = tDb.prepare("SELECT id FROM product_variants WHERE product_id = ?").all(prod.id);
          for (const v of variants) {
            tDb.prepare("DELETE FROM stock_movements WHERE product_variant_id = ?").run(v.id);
            tDb.prepare("DELETE FROM stock_balances WHERE product_variant_id = ?").run(v.id);
          }
          tDb.prepare("DELETE FROM product_variants WHERE product_id = ?").run(prod.id);
          tDb.prepare("DELETE FROM products WHERE id = ?").run(prod.id);
        }

        // 2. Delete associated suit models and their units
        const models = tDb.prepare("SELECT id FROM suit_models WHERE category_id = ?").all(targetId);
        for (const m of models) {
          const units = tDb.prepare("SELECT id FROM suit_units WHERE suit_model_id = ?").all(m.id);
          for (const u of units) {
            tDb.prepare("DELETE FROM unit_status_history WHERE suit_unit_id = ?").run(u.id);
            tDb.prepare("DELETE FROM cleaning_records WHERE suit_unit_id = ?").run(u.id);
            tDb.prepare("DELETE FROM maintenance_records WHERE suit_unit_id = ?").run(u.id);
            tDb.prepare("DELETE FROM tasks WHERE suit_unit_id = ?").run(u.id);
            tDb.prepare("DELETE FROM suit_units WHERE id = ?").run(u.id);
          }
          tDb.prepare("DELETE FROM suit_models WHERE id = ?").run(m.id);
        }

        // 3. Delete the category itself
        tDb.prepare("DELETE FROM categories WHERE id = ?").run(targetId);
        logger.info(`Cleanly hard-deleted category ID: ${targetId} and all unbooked items`);
      }
      return true;
    });
  }

  // --- 2. Warehouses (المخازن والفروع) ---
  getWarehouses(onlyActive = false) {
    const sql = onlyActive
      ? 'SELECT * FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, id ASC'
      : 'SELECT * FROM warehouses ORDER BY is_default DESC, id ASC';
    return this.dbConn.all(sql);
  }

  createWarehouse({ code, name, location = '', is_default = 0 }) {
    if (!code || !name) throw new Error('كود واسم المخزن مطلوبان.');
    const db = this.dbConn.getDb();

    return TransactionHelper.runInTransaction(db, (tDb) => {
      if (is_default === 1) {
        tDb.prepare('UPDATE warehouses SET is_default = 0').run();
      }
      const stmt = tDb.prepare('INSERT INTO warehouses (code, name, location, is_default, is_active) VALUES (?, ?, ?, ?, 1)');
      const res = stmt.run(code.trim().toUpperCase(), name.trim(), location.trim(), is_default);
      logger.info(`Created warehouse: ${name} (${code})`);
      return { id: res.lastInsertRowid, code, name, location, isDefault: is_default };
    });
  }

  setDefaultWarehouse(id) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      tDb.prepare('UPDATE warehouses SET is_default = 0').run();
      tDb.prepare('UPDATE warehouses SET is_default = 1 WHERE id = ?').run(id);
      logger.info(`Set warehouse ID ${id} as default`);
      return true;
    });
  }

  updateWarehouse(id, { name, location, is_default, is_active }) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      if (is_default === 1) {
        tDb.prepare('UPDATE warehouses SET is_default = 0').run();
      }
      const stmt = tDb.prepare('UPDATE warehouses SET name = COALESCE(?, name), location = COALESCE(?, location), is_default = COALESCE(?, is_default), is_active = COALESCE(?, is_active) WHERE id = ?');
      stmt.run(name ? name.trim() : null, location !== undefined ? location.trim() : null, is_default !== undefined ? is_default : null, is_active !== undefined ? is_active : null, id);
      logger.info(`Updated warehouse ID: ${id}`);
      return true;
    });
  }

  deleteWarehouse(id) {
    const targetId = Number(id);
    const db = this.dbConn.getDb();
    const wh = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(targetId);
    if (!wh) throw new Error('المخزن غير موجود.');
    if (wh.is_default) {
      throw new Error('لا يمكن حذف المخزن الافتراضي للنظام.');
    }

    // Check if warehouse has active units or stock on hand
    const unitsCount = db.prepare('SELECT COUNT(*) as count FROM suit_units WHERE warehouse_id = ?').get(targetId);
    const stockCount = db.prepare('SELECT SUM(quantity_on_hand) as total FROM stock_balances WHERE warehouse_id = ?').get(targetId);

    if (unitsCount?.count > 0 || (stockCount?.total && stockCount.total > 0)) {
      throw new Error('لا يمكن حذف هذا المخزن لوجود بضاعة أو بدل مسجلة به حالياً. يرجى نقل البضاعة أولاً.');
    }

    return TransactionHelper.runInTransaction(db, (tDb) => {
      const movements = tDb.prepare('SELECT COUNT(*) as count FROM stock_movements WHERE warehouse_id = ?').get(targetId);
      if (movements?.count > 0) {
        tDb.prepare('UPDATE warehouses SET is_active = 0 WHERE id = ?').run(targetId);
        logger.info(`Soft-deleted warehouse ID: ${targetId} due to movement history`);
      } else {
        tDb.prepare('DELETE FROM stock_balances WHERE warehouse_id = ?').run(targetId);
        tDb.prepare('DELETE FROM warehouses WHERE id = ?').run(targetId);
        logger.info(`Cleanly deleted warehouse ID: ${targetId}`);
      }
      return true;
    });
  }

  // --- 3. Sizes (المقاسات) ---
  getSizes(categoryType = null) {
    if (categoryType) {
      const norm = String(categoryType).trim().toUpperCase();
      let sql = 'SELECT * FROM sizes WHERE is_active = 1';
      const params = [];
      if (norm === 'SHOE' || norm === 'SHOES') {
        sql += ` AND (
          UPPER(category_type) IN ('SHOE', 'SHOES')
          OR UPPER(category_type) IN (SELECT UPPER(code) FROM categories WHERE type = 'SHOES' OR code = 'SHOES')
        )`;
      } else if (norm === 'SUIT' || norm === 'SUITS') {
        sql += ` AND (
          UPPER(category_type) IN ('SUIT', 'SUITS')
          OR UPPER(category_type) IN (SELECT UPPER(code) FROM categories WHERE type = 'SUITS' OR code = 'SUITS')
        )`;
      } else if (norm === 'ACCESSORIES' || norm === 'ACCESSORY' || norm === 'TIES' || norm === 'اضافات' || norm === 'إكسسوارات') {
        sql += ` AND (
          UPPER(category_type) IN ('ACCESSORIES', 'ACCESSORY', 'TIES')
          OR UPPER(category_type) IN (
            SELECT UPPER(code) FROM categories 
            WHERE type = 'ACCESSORIES' OR code IN ('ACCESSORIES', 'TIES') OR name LIKE '%إكسسوار%' OR name LIKE '%اضاف%'
          )
        )`;
      } else {
        sql += ` AND (
          UPPER(category_type) = ? 
          OR category_type = ?
          OR UPPER(category_type) IN (
            SELECT UPPER(code) FROM categories 
            WHERE UPPER(type) = ? OR UPPER(code) = ? OR UPPER(name) = ? OR id = ?
          )
        )`;
        params.push(norm, String(categoryType).trim(), norm, norm, String(categoryType).trim(), Number(categoryType) || -1);
      }
      sql += ' ORDER BY sort_order ASC, id ASC';
      return this.dbConn.all(sql, params);
    }
    const sql = 'SELECT * FROM sizes WHERE is_active = 1 ORDER BY category_type ASC, sort_order ASC';
    return this.dbConn.all(sql);
  }

  createSize({ category_type = 'SUIT', code, name, sort_order = 0 }) {
    if (!code || !name) throw new Error('كود واسم المقاس مطلوبان.');
    const db = this.dbConn.getDb();
    const stmt = db.prepare('INSERT INTO sizes (category_type, code, name, sort_order, is_active) VALUES (?, ?, ?, ?, 1)');
    const res = stmt.run(category_type, code.trim(), name.trim(), sort_order);
    logger.info(`Created size: ${name} for ${category_type}`);
    return { id: res.lastInsertRowid, categoryType: category_type, code, name, sortOrder: sort_order };
  }

  updateSize(id, { category_type, code, name, sort_order, is_active }) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare('UPDATE sizes SET category_type = COALESCE(?, category_type), code = COALESCE(?, code), name = COALESCE(?, name), sort_order = COALESCE(?, sort_order), is_active = COALESCE(?, is_active) WHERE id = ?');
    stmt.run(category_type || null, code ? code.trim() : null, name ? name.trim() : null, sort_order !== undefined ? sort_order : null, is_active !== undefined ? is_active : null, id);
    logger.info(`Updated size ID: ${id}`);
    return true;
  }

  deleteSize(id) {
    const targetId = Number(id);
    const db = this.dbConn.getDb();
    const size = db.prepare('SELECT * FROM sizes WHERE id = ?').get(targetId);
    if (!size) throw new Error('المقاس غير موجود.');

    const usedInUnits = db.prepare('SELECT COUNT(*) as count FROM suit_units WHERE size_id = ?').get(targetId);
    const usedInVariants = db.prepare('SELECT COUNT(*) as count FROM product_variants WHERE size_id = ?').get(targetId);
    const isUsed = (usedInUnits?.count > 0) || (usedInVariants?.count > 0);

    if (isUsed) {
      db.prepare('UPDATE sizes SET is_active = 0 WHERE id = ?').run(targetId);
      logger.info(`Soft-deleted size ID: ${targetId}`);
    } else {
      db.prepare('DELETE FROM sizes WHERE id = ?').run(targetId);
      logger.info(`Deleted size ID: ${targetId}`);
    }
    return true;
  }

  // --- 4. Colors (الألوان) ---
  getColors(onlyActive = true) {
    const sql = onlyActive
      ? 'SELECT * FROM colors WHERE is_active = 1 ORDER BY id ASC'
      : 'SELECT * FROM colors ORDER BY id ASC';
    return this.dbConn.all(sql);
  }

  createColor({ name, hex_code = '#000000' }) {
    if (!name) throw new Error('اسم اللون مطلوب.');
    const db = this.dbConn.getDb();
    const stmt = db.prepare('INSERT INTO colors (name, hex_code, is_active) VALUES (?, ?, 1)');
    const res = stmt.run(name.trim(), hex_code.trim());
    logger.info(`Created color: ${name} (${hex_code})`);
    return { id: res.lastInsertRowid, name, hexCode: hex_code };
  }

  updateColor(id, { name, hex_code, is_active }) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare('UPDATE colors SET name = COALESCE(?, name), hex_code = COALESCE(?, hex_code), is_active = COALESCE(?, is_active) WHERE id = ?');
    stmt.run(name ? name.trim() : null, hex_code ? hex_code.trim() : null, is_active !== undefined ? is_active : null, id);
    logger.info(`Updated color ID: ${id}`);
    return true;
  }

  deleteColor(id) {
    const targetId = Number(id);
    const db = this.dbConn.getDb();
    const color = db.prepare('SELECT * FROM colors WHERE id = ?').get(targetId);
    if (!color) throw new Error('اللون غير موجود.');

    const usedInModels = db.prepare('SELECT COUNT(*) as count FROM suit_models WHERE color_id = ?').get(targetId);
    const usedInVariants = db.prepare('SELECT COUNT(*) as count FROM product_variants WHERE color_id = ?').get(targetId);
    const isUsed = (usedInModels?.count > 0) || (usedInVariants?.count > 0);

    if (isUsed) {
      db.prepare('UPDATE colors SET is_active = 0 WHERE id = ?').run(targetId);
      logger.info(`Soft-deleted color ID: ${targetId}`);
    } else {
      db.prepare('DELETE FROM colors WHERE id = ?').run(targetId);
      logger.info(`Deleted color ID: ${targetId}`);
    }
    return true;
  }

  // --- 5. Rental Policies (سياسات التأجير وتأخير الإرجاع) ---
  getRentalPolicies() {
    const db = this.dbConn.getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'rental_policy_%'").all();
    const policies = {
      defaultRentalDays: 3,
      bufferCleaningDays: 1,
      enableSecurityDeposit: true, // هل يطبق مبلغ التأمين
      defaultDepositRatio: 1.0,    // 100% of rental price
      applyLateFee: true,          // هل تطبق غرامة التأخير
      lateFeePerDay: 300,          // 300 EGP per day
      allowGracePeriod: true,      // هل توجد فترة سماح
      allowGracePeriodHours: 4     // 4 hours grace before late fee
    };

    const booleanKeys = new Set(['enableSecurityDeposit', 'applyLateFee', 'allowGracePeriod']);
    for (const r of rows) {
      const cleanKey = r.key.replace('rental_policy_', '');
      const val = r.value;
      if (booleanKeys.has(cleanKey)) {
        policies[cleanKey] = (val === 'true' || val === '1');
      } else if (!isNaN(Number(val)) && String(val).trim() !== '') {
        policies[cleanKey] = Number(val);
      } else {
        policies[cleanKey] = val;
      }
    }
    return policies;
  }

  updateRentalPolicies(policies) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const stmt = tDb.prepare(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES (?, ?, 'سياسة تأجير معتمدة', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);

      for (const [k, v] of Object.entries(policies)) {
        stmt.run(`rental_policy_${k}`, String(v));
      }
      logger.info('Updated rental policies successfully');
      return this.getRentalPolicies();
    });
  }
}

const adminService = new AdminService();
module.exports = { adminService, AdminService };

