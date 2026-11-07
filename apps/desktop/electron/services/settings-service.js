const crypto = require('crypto');
const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { logger } = require('../logging/logger');

class SettingsService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  // --- 1. Store Profile (بيانات المتجر والفاتورة) ---
  getStoreProfile() {
    const db = this.dbConn.getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'store_%'").all();
    const profile = {
      storeName: 'رويال للبدل والعرائس',
      phone: '01000000000',
      address: 'القاهرة، مصر',
      taxNumber: '',
      invoiceFooter: 'شكرًا لتعاملكم مع رويال للبدل. يرجى الحفاظ على البدلة وإرجاعها في الموعد المحدد.',
      currency: 'EGP'
    };

    for (const r of rows) {
      const cleanKey = r.key.replace('store_', '');
      profile[cleanKey] = r.value;
    }
    return profile;
  }

  updateStoreProfile(data) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const stmt = tDb.prepare(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES (?, ?, 'بيانات المتجر العامة', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);

      for (const [k, v] of Object.entries(data)) {
        stmt.run(`store_${k}`, String(v));
      }
      logger.info('Updated store profile successfully');
      return true;
    });
  }

  // --- 2. Printer Preferences (إعدادات الطابعات) ---
  getPrinterSettings() {
    const db = this.dbConn.getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'printer_%'").all();
    const settings = {
      receiptPrinter: 'Default Thermal 80mm',
      invoicePrinter: 'Default A4',
      autoPrintReceipt: true,
      previewBeforePrint: false
    };

    for (const r of rows) {
      const cleanKey = r.key.replace('printer_', '');
      settings[cleanKey] = r.value === 'true' ? true : (r.value === 'false' ? false : r.value);
    }
    return settings;
  }

  updatePrinterSettings(settings) {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const stmt = tDb.prepare(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES (?, ?, 'إعدادات الطابعة', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);

      for (const [k, v] of Object.entries(settings)) {
        stmt.run(`printer_${k}`, String(v));
      }
      logger.info('Updated printer settings');
      return true;
    });
  }

  // --- 3. Screen Lock & Security PIN (قفل الشاشة وحماية النظام) ---
  hashPin(pin) {
    return crypto.createHash('sha256').update(String(pin)).digest('hex');
  }

  setPin(newPin) {
    if (!newPin || String(newPin).length < 4) {
      throw new Error('رمز PIN يجب أن يتكون من 4 أرقام على الأقل.');
    }
    const hash = this.hashPin(newPin);
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, description, updated_at)
      VALUES ('security_pin_hash', ?, 'رمز قفل الشاشة المشفر', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run(hash);
    logger.info('Security PIN updated successfully');
    return true;
  }

  verifyPin(inputPin) {
    const db = this.dbConn.getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'security_pin_hash'").get();
    if (!row) {
      // Default initial PIN: 1234
      return String(inputPin) === '1234';
    }
    const inputHash = this.hashPin(inputPin);
    return row.value === inputHash;
  }
}

const settingsService = new SettingsService();
module.exports = { settingsService, SettingsService };

