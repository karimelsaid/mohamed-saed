const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { logger } = require('../logging/logger');

class AdminService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  // --- 1. Categories (الأقسام والتصنيفات) ---
  getCategories(onlyActive = false) {
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

  updateCategory(id, { name, is_active }) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare('UPDATE categories SET name = COALESCE(?, name), is_active = COALESCE(?, is_active) WHERE id = ?');
    stmt.run(name ? name.trim() : null, is_active !== undefined ? is_active : null, id);
    logger.info(`Updated category ID: ${id}`);
    return true;
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

  // --- 3. Sizes (المقاسات) ---
  getSizes(categoryType = null) {
    const sql = categoryType
      ? 'SELECT * FROM sizes WHERE category_type = ? AND is_active = 1 ORDER BY sort_order ASC, id ASC'
      : 'SELECT * FROM sizes WHERE is_active = 1 ORDER BY category_type ASC, sort_order ASC';
    const params = categoryType ? [categoryType] : [];
    return this.dbConn.all(sql, params);
  }

  createSize({ category_type = 'SUIT', code, name, sort_order = 0 }) {
    if (!code || !name) throw new Error('كود واسم المقاس مطلوبان.');
    const db = this.dbConn.getDb();
    const stmt = db.prepare('INSERT INTO sizes (category_type, code, name, sort_order, is_active) VALUES (?, ?, ?, ?, 1)');
    const res = stmt.run(category_type, code.trim(), name.trim(), sort_order);
    logger.info(`Created size: ${name} for ${category_type}`);
    return { id: res.lastInsertRowid, categoryType: category_type, code, name, sortOrder: sort_order };
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

  // --- 5. Rental Policies (سياسات التأجير وتأخير الإرجاع) ---
  getRentalPolicies() {
    const db = this.dbConn.getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'rental_policy_%'").all();
    const policies = {
      defaultRentalDays: 3,
      bufferCleaningDays: 1,
      defaultDepositRatio: 1.0, // 100% of rental price or custom
      lateFeePerDay: 300,       // 300 EGP per day
      allowGracePeriodHours: 4  // 4 hours grace before late fee
    };

    for (const r of rows) {
      const cleanKey = r.key.replace('rental_policy_', '');
      policies[cleanKey] = Number(r.value) || r.value;
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
      return true;
    });
  }
}

const adminService = new AdminService();
module.exports = { adminService, AdminService };
