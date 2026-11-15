const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../logging/logger');

class BackupApi {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  createLocalBackup(destinationDir) {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `suit-store-backup-${timestamp}.db`;
    const targetPath = path.join(destinationDir, backupFileName);

    const db = this.dbConn.getDb();
    logger.info(`Starting SQLite vacuum backup into: ${targetPath}`);

    // SQLite safe online backup via VACUUM INTO
    // Escape single quotes in path for SQL
    const sanitizedPath = targetPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${sanitizedPath}';`);

    const stats = fs.statSync(targetPath);
    const fileBuffer = fs.readFileSync(targetPath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Record in backup_records
    const insertStmt = db.prepare(`
      INSERT INTO backup_records (backup_type, file_path, file_size_bytes, checksum_sha256, is_encrypted, status)
      VALUES ('LOCAL', ?, ?, ?, 0, 'SUCCESS')
    `);
    insertStmt.run(targetPath, stats.size, checksum);

    logger.info(`Backup created successfully: ${backupFileName} (${stats.size} bytes)`);

    return {
      success: true,
      filePath: targetPath,
      fileName: backupFileName,
      sizeBytes: stats.size,
      checksumSha256: checksum,
      createdAt: new Date().toISOString()
    };
  }

  verifyBackup(backupPath) {
    if (!fs.existsSync(backupPath)) {
      return { valid: false, error: 'الملف غير موجود' };
    }

    try {
      const { DatabaseSync } = require('node:sqlite');
      const testDb = new DatabaseSync(backupPath);
      const row = testDb.prepare('PRAGMA integrity_check;').get();
      const isValid = Object.values(row)[0] === 'ok';
      testDb.close();

      return { valid: isValid, checkedAt: new Date().toISOString() };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

module.exports = { BackupApi };

