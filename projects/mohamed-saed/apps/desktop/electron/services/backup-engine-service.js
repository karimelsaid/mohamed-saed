const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { dbConnection } = require('../database/connection');
const { logger } = require('../logging/logger');

class BackupEngineService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  /**
   * مجلد النسخ الاحتياطية الافتراضي
   */
  getDefaultBackupDir() {
    const dbPath = this.dbConn.resolveDatabasePath ? this.dbConn.resolveDatabasePath() : (this.dbConn.customPath || this.dbConn.dbPath);
    const defaultDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    return defaultDir;
  }

  /**
   * استرجاع معلومات مجلد وملفات النسخ الاحتياطي
   */
  getBackupInfo() {
    const backupDir = this.getDefaultBackupDir();
    const dbPath = this.dbConn.resolveDatabasePath ? this.dbConn.resolveDatabasePath() : (this.dbConn.customPath || this.dbConn.dbPath);
    let latestBackup = null;
    let backupFiles = [];

    try {
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
        backupFiles = files.map(file => {
          const fullPath = path.join(backupDir, file);
          const stat = fs.statSync(fullPath);
          return {
            fileName: file,
            filePath: fullPath,
            sizeBytes: stat.size,
            mtime: stat.mtime
          };
        }).sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

        if (backupFiles.length > 0) {
          latestBackup = backupFiles[0];
        }
      }
    } catch (e) {
      logger.warn(`Could not read backup directory: ${e.message}`);
    }

    return {
      backupDir,
      dbPath,
      latestBackup,
      backupCount: backupFiles.length,
      backupFiles
    };
  }

  /**
   * تصفير شامل لقاعدة البيانات مع أخذ نسخة احتياطية وقائية تلقائياً
   */
  async resetDatabase() {
    // 1. أخذ نسخة احتياطية وقائية قبل أي تصفير
    const safetyRes = await this.createLocalBackup({
      customFileName: `safety_before_factory_reset_${Date.now()}.db`
    });
    logger.info(`Created pre-reset safety backup at: ${safetyRes.filePath}`);

    // 2. تفريغ الجداول التشغيلية مع الحفاظ على الإعدادات والبيانات الأساسية
    const db = this.dbConn.getDb();
    const tablesToTruncate = [
      'booking_items',
      'booking_status_history',
      'rental_contracts',
      'bookings',
      'sale_items',
      'sale_return_items',
      'sales_returns',
      'sales',
      'invoices',
      'invoice_items',
      'payments',
      'cash_transactions',
      'expenses',
      'financial_reversals',
      'cash_sessions',
      'unit_status_history',
      'cleaning_records',
      'maintenance_records',
      'suit_units',
      'suit_models',
      'stock_balances',
      'stock_movements',
      'product_variants',
      'products',
      'tasks',
      'notifications',
      'notification_logs',
      'customer_notes',
      'customers'
    ];

    db.exec('PRAGMA foreign_keys = OFF;');
    for (const table of tablesToTruncate) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
        try {
          db.prepare(`DELETE FROM sqlite_sequence WHERE name = '${table}'`).run();
        } catch (_) {}
      } catch (e) {
        logger.warn(`Could not truncate table ${table}: ${e.message}`);
      }
    }
    db.exec('PRAGMA foreign_keys = ON;');
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (_) {}

    logger.info('Database operational tables successfully cleared.');

    return {
      success: true,
      safetyBackup: safetyRes
    };
  }

  /**
   * حساب بصمة SHA256 لملف
   */
  calculateFileChecksum(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * 1. إنشاء نسخة احتياطية محلية متسقة بالكامل عبر SQLite Online Backup API / VACUUM INTO
   */
  async createLocalBackup({ targetDir = null, customFileName = null } = {}) {
    const destinationDir = targetDir || this.getDefaultBackupDir();
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const rand = crypto.randomBytes(3).toString('hex');
    const fileName = customFileName || `suit_store_backup_${timestamp}_${rand}.db`;
    const destFilePath = path.join(destinationDir, fileName);

    if (fs.existsSync(destFilePath)) {
      try { fs.unlinkSync(destFilePath); } catch (_) {}
    }

    const db = this.dbConn.getDb();

    logger.info(`Starting SQLite live online backup to: ${destFilePath}`);

    // SQLite VACUUM INTO ensures a 100% consistent, compacted standalone backup in WAL mode
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const safeDest = destFilePath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safeDest}';`);

    // Verify written file
    if (!fs.existsSync(destFilePath)) {
      throw new Error('فشل إنشاء ملف النسخة الاحتياطية على القرص.');
    }

    const stat = fs.statSync(destFilePath);
    const checksum = this.calculateFileChecksum(destFilePath);

    // Verify integrity of the newly created backup
    const verifyRes = this.verifyBackupIntegrity(destFilePath);
    if (!verifyRes.valid) {
      fs.unlinkSync(destFilePath);
      throw new Error(`فشل فحص سلامة النسخة الاحتياطية المنشأة: ${verifyRes.error}`);
    }

    // Record in backup_records table
    let recordId = null;
    try {
      const stmt = db.prepare(`
        INSERT INTO backup_records (backup_type, file_path, file_size_bytes, checksum_sha256, is_encrypted, status)
        VALUES ('LOCAL', ?, ?, ?, 0, 'SUCCESS')
      `);
      const res = stmt.run(destFilePath, stat.size, checksum);
      recordId = res.lastInsertRowid;
    } catch (e) {
      logger.warn(`Could not log backup to backup_records: ${e.message}`);
    }

    logger.info(`Local Backup created successfully [${fileName}] (${stat.size} bytes, SHA256: ${checksum.slice(0, 10)}...)`);

    return {
      success: true,
      backupId: recordId,
      filePath: destFilePath,
      fileName,
      fileSizeBytes: stat.size,
      checksum,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 2. التحقق الصارم من سلامة ملف النسخة الاحتياطية (Integrity Check)
   */
  verifyBackupIntegrity(backupFilePath) {
    if (!backupFilePath || !fs.existsSync(backupFilePath)) {
      return { valid: false, error: 'ملف النسخة الاحتياطية غير موجود على المسار المحدد.' };
    }

    const stat = fs.statSync(backupFilePath);
    if (stat.size === 0) {
      return { valid: false, error: 'حجم ملف النسخة الاحتياطية 0 بايت (ملف فارغ أو تالف).' };
    }

    const checksum = this.calculateFileChecksum(backupFilePath);

    // Open target backup database in read-only mode to verify structure and data integrity
    let testDb = null;
    try {
      testDb = new DatabaseSync(backupFilePath, { readOnly: true });
      const row = testDb.prepare('PRAGMA integrity_check;').all();
      const isOk = Array.isArray(row) && row.length > 0 && row[0].integrity_check === 'ok';

      if (!isOk) {
        return { valid: false, error: 'فشل فحص السلامة الهيكلية لقاعدة البيانات (PRAGMA integrity_check failed).' };
      }

      // Check essential schema presence
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);

      const required = ['customers', 'bookings', 'suit_units', 'sales', 'cash_sessions'];
      const missing = required.filter(r => !tableNames.includes(r));
      if (missing.length > 0) {
        return { valid: false, error: `النسخة الاحتياطية تفتقر لجداول أساسية: ${missing.join(', ')}` };
      }

      return {
        valid: true,
        integrity: 'ok',
        checksum,
        fileSizeBytes: stat.size,
        tableCount: tableNames.length
      };
    } catch (err) {
      return { valid: false, error: `خطأ في قراءة ملف SQLite: ${err.message}` };
    } finally {
      if (testDb) {
        try { testDb.close(); } catch (_) {}
      }
    }
  }

  /**
   * 3. محرك الاستعادة الآمن مع إنشاء نسخة وقائية تلقائية قبل الكتابة
   */
  async restoreFromBackup({ backupFilePath, safetyBackup = true } = {}) {
    if (!backupFilePath) throw new Error('مسار ملف النسخة الاحتياطية مطلوب للاستعادة.');

    // Step 1: Strict Verification of the backup file first
    const verification = this.verifyBackupIntegrity(backupFilePath);
    if (!verification.valid) {
      throw new Error(`لا يمكن استعادة النسخة: ${verification.error}`);
    }

    const liveDbPath = this.dbConn.resolveDatabasePath();
    let safetyBackupPath = null;
    const liveDb = this.dbConn.getDb();

    // Step 2: Create pre-restore safety snapshot of the live database
    if (safetyBackup && fs.existsSync(liveDbPath)) {
      const backupDir = this.getDefaultBackupDir();
      safetyBackupPath = path.join(backupDir, `safety_snapshot_before_restore_${Date.now()}.db`);
      try { liveDb.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}
      const safeSnapshot = safetyBackupPath.replace(/'/g, "''");
      try {
        liveDb.exec(`VACUUM INTO '${safeSnapshot}';`);
        logger.info(`Created pre-restore safety snapshot at: ${safetyBackupPath}`);
      } catch (e) {
        logger.warn(`Could not create safety snapshot before restore: ${e.message}`);
      }
    }

    // Step 3: Atomic In-Database Restore via ATTACH DATABASE (100% resilient, no file locks)
    const normalizedBackupPath = backupFilePath.replace(/\\/g, '/').replace(/'/g, "''");
    
    // Ensure any previously attached backup_source is detached
    try { liveDb.exec('DETACH DATABASE backup_source;'); } catch (_) {}

    liveDb.exec(`ATTACH DATABASE '${normalizedBackupPath}' AS backup_source;`);

    // Get all tables from backup
    const tables = liveDb.prepare("SELECT name FROM backup_source.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

    liveDb.exec('PRAGMA foreign_keys = OFF;');
    try {
      liveDb.exec('BEGIN TRANSACTION;');
      for (const t of tables) {
        const tableName = t.name;
        try { liveDb.exec(`DELETE FROM main.${tableName};`); } catch (_) {}
        try { liveDb.exec(`INSERT INTO main.${tableName} SELECT * FROM backup_source.${tableName};`); } catch (err) {
          logger.warn(`Could not insert into table ${tableName}: ${err.message}`);
        }
      }

      // Restore sqlite_sequence if exists
      try {
        liveDb.exec('DELETE FROM main.sqlite_sequence;');
        liveDb.exec('INSERT INTO main.sqlite_sequence SELECT * FROM backup_source.sqlite_sequence;');
      } catch (_) {}

      liveDb.exec('COMMIT;');
    } catch (err) {
      try { liveDb.exec('ROLLBACK;'); } catch (_) {}
      try { liveDb.exec('DETACH DATABASE backup_source;'); } catch (_) {}
      liveDb.exec('PRAGMA foreign_keys = ON;');
      throw new Error(`فشلت استعادة البيانات: ${err.message}`);
    }

    try { liveDb.exec('DETACH DATABASE backup_source;'); } catch (_) {}
    liveDb.exec('PRAGMA foreign_keys = ON;');
    try { liveDb.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}

    // Verify restored database integrity
    const postCheck = liveDb.prepare('PRAGMA integrity_check;').all();
    const restoredOk = Array.isArray(postCheck) && postCheck[0].integrity_check === 'ok';

    if (!restoredOk) {
      throw new Error('فشلت الاستعادة: قاعدة البيانات الناتجة لم تجتز فحص السلامة.');
    }

    logger.info(`Database successfully restored from: ${backupFilePath}`);

    return {
      success: true,
      restoredFrom: backupFilePath,
      safetyBackupPath,
      restoredAt: new Date().toISOString()
    };
  }

  /**
   * 4. جلب سجل النسخ الاحتياطية السابقة
   */
  getBackupHistory({ limit = 30 } = {}) {
    return this.dbConn.all(`
      SELECT * FROM backup_records
      ORDER BY id DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * 5. المزامنة السحابية الحقيقية مع Google Drive
   */
  async syncGoogleDrive({ backupFilePath = null } = {}) {
    let targetFile = backupFilePath;
    if (!targetFile) {
      const latest = await this.createLocalBackup();
      targetFile = latest.filePath;
    }

    const { googleDriveService } = require('./google-drive-service');
    return googleDriveService.uploadBackupFile(targetFile);
  }

  /**
   * 6. سجل عمليات المزامنة السحابية مع Google Drive
   */
  getGoogleDriveSyncHistory(limit = 10) {
    try {
      const records = this.dbConn.all(`
        SELECT id, backup_type, file_path, file_size_bytes, checksum_sha256, is_encrypted, status, created_at
        FROM backup_records
        WHERE backup_type = 'GOOGLE_DRIVE'
        ORDER BY id DESC
        LIMIT ?
      `, [limit]);
      return records;
    } catch (_) {
      return [];
    }
  }

  /**
   * 7. جلب قائمة النسخ الاحتياطية المتوفرة على Google Drive
   */
  async listGoogleDriveBackups() {
    const { googleDriveService } = require('./google-drive-service');
    return googleDriveService.listBackupFiles();
  }

  /**
   * 8. استعادة قاعدة البيانات مباشرة من نسخة على Google Drive
   */
  async restoreFromGoogleDrive({ fileId, safetyBackup = true } = {}) {
    if (!fileId) throw new Error('يرجى تحديد النسخة السحابية المراد استعادتها.');

    const { googleDriveService } = require('./google-drive-service');
    const backupDir = this.getDefaultBackupDir();

    // Step 1: Download backup file from Google Drive
    logger.info(`Starting download of Google Drive backup (File ID: ${fileId})...`);
    const downloaded = await googleDriveService.downloadBackupFile(fileId, backupDir);

    // Step 2: Restore from the downloaded file using atomic restoreFromBackup
    logger.info(`Downloaded Google Drive backup to: ${downloaded.filePath}. Beginning atomic restore...`);
    const restoreResult = this.restoreFromBackup({
      backupFilePath: downloaded.filePath,
      safetyBackup
    });

    // Step 3: Record the cloud restore in backup_records
    try {
      const crypto = require('crypto');
      const fileBuf = fs.readFileSync(downloaded.filePath);
      const checksum = crypto.createHash('sha256').update(fileBuf).digest('hex');
      this.dbConn.run(`
        INSERT INTO backup_records (backup_type, file_path, file_size_bytes, checksum_sha256, is_encrypted, status)
        VALUES ('RESTORE_GDRIVE', ?, ?, ?, 0, 'SUCCESS')
      `, [downloaded.filePath, downloaded.sizeBytes, checksum]);
    } catch (e) {
      logger.warn(`Could not log RESTORE_GDRIVE record: ${e.message}`);
    }

    return {
      success: true,
      restoredFrom: 'GOOGLE_DRIVE',
      fileName: downloaded.fileName,
      filePath: downloaded.filePath,
      safetyBackupPath: restoreResult.safetyBackupPath,
      restoredAt: new Date().toISOString()
    };
  }
}

const backupEngineService = new BackupEngineService();

module.exports = {
  BackupEngineService,
  backupEngineService
};
