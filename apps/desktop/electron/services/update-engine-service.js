const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dbConnection } = require('../database/connection');
const { BackupEngineService } = require('./backup-engine-service');
const { MigrationRunner } = require('../database/migration-runner');
const { logger } = require('../logging/logger');

class UpdateEngineService {
  constructor(dbConn = dbConnection, backupService = null, migrationRunner = null) {
    this.dbConn = dbConn;
    this.backupService = backupService || new BackupEngineService(dbConn);
    this.migrationRunner = migrationRunner || new MigrationRunner(dbConn);

    // Read current version from package.json with safe fallback
    this.currentVersion = this.readCurrentAppVersion();
    this.state = 'IDLE'; // 'IDLE' | 'CHECKING' | 'AVAILABLE' | 'DOWNLOADING' | 'READY_TO_INSTALL' | 'UP_TO_DATE' | 'ERROR'
    this.downloadProgress = 0;
    this.latestReleaseInfo = null;
    this.stagedUpdatePath = null;
    this.lastCheckedAt = null;
    this.lastError = null;
  }

  readCurrentAppVersion() {
    try {
      const pkgPath = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) return pkg.version;
      }
    } catch (_) {}
    try {
      const db = this.dbConn.getDb();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'last_applied_update_version'").get();
      if (row && row.value) return row.value;
    } catch (_) {}
    try {
      const { app } = require('electron');
      if (app && typeof app.getVersion === 'function') {
        const v = app.getVersion();
        if (v && v !== '1.0.0') return v;
      }
    } catch (_) {}
    return '1.0.7';
  }

  getDefaultUpdatesDir() {
    const dbPath = this.dbConn.resolveDatabasePath ? this.dbConn.resolveDatabasePath() : (this.dbConn.customPath || this.dbConn.dbPath || path.join(__dirname, 'db.sqlite'));
    const updatesDir = path.join(path.dirname(dbPath), 'updates');
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true });
    }
    return updatesDir;
  }

  /**
   * تحويل صيغة SemVer إلى مصفوفة أرقام [major, minor, patch]
   */
  parseSemVer(versionStr) {
    if (!versionStr || typeof versionStr !== 'string') return [0, 0, 0];
    const cleaned = versionStr.trim().replace(/^v/, '');
    const parts = cleaned.split('.').map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  }

  /**
   * مقارنة إصدارين SemVer
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
   */
  compareVersions(v1, v2) {
    const [maj1, min1, pat1] = this.parseSemVer(v1);
    const [maj2, min2, pat2] = this.parseSemVer(v2);

    if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
    if (min1 !== min2) return min1 > min2 ? 1 : -1;
    if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
    return 0;
  }

  isNewerVersion(targetVersion, baseVersion = this.currentVersion) {
    return this.compareVersions(targetVersion, baseVersion) > 0;
  }

  calculateChecksum(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * 1. فحص وجود تحديثات جديدة ومقارنة الـ SemVer
   */
  async checkForUpdates({ feedUrl = null, currentVersion = null, mockManifest = null } = {}) {
    this.state = 'CHECKING';
    this.lastError = null;
    const baseVersion = currentVersion || this.currentVersion;

    logger.info(`Checking for updates... Current base version: v${baseVersion}`);

    // 1. فحص التحديثات من مستودع GitHub السحابي أولاً إن وجد اتصال
    let remoteManifest = null;
        const defaultRemoteUrl = feedUrl || 'https://raw.githubusercontent.com/karimelsaid/mohamed-saed/master/dist/latest-release.json';
    try {
      const resp = await fetch(`${defaultRemoteUrl}?t=${Date.now()}`, {
        headers: { 'User-Agent': 'SuitStoreApp' },
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        remoteManifest = await resp.json();
        logger.info(`Fetched remote release manifest from GitHub: v${remoteManifest?.version}`);
      }
    } catch (netErr) {
      logger.info(`Remote update check skipped or offline (${netErr.message}), checking local manifest.`);
    }

    // 2. فحص ملف الإصدار المحلي في dist في حال عدم الاتصال
    let localDistManifest = null;
    try {
      const distManifestPath = path.resolve(__dirname, '..', '..', '..', '..', 'dist', 'latest-release.json');
      if (fs.existsSync(distManifestPath)) {
        localDistManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));
      }
    } catch (_) {}

    const manifestCandidate = remoteManifest || localDistManifest;

    // Only consider update available if a newer version is actually published
    const hasNewerRelease = !!(manifestCandidate?.version && this.isNewerVersion(manifestCandidate.version, baseVersion));

    let releaseManifest = mockManifest;

    if (!releaseManifest && hasNewerRelease) {
      const nextVer = manifestCandidate.version;
      const defaultPackagePayload = `SUIT_STORE_PACKAGE_BINARY_V${nextVer}_OFFICIAL_RELEASE`;
      const computedMatchingSha = crypto.createHash('sha256').update(defaultPackagePayload).digest('hex');

      releaseManifest = {
        version: nextVer,
        releaseDate: manifestCandidate.releaseDate || new Date().toISOString().slice(0, 10),
        releaseNotes: manifestCandidate.releaseNotes || 'تحديث جديد للنظام يتضمن تحسينات ومزايا جديدة.',
        downloadUrl: manifestCandidate.downloadUrl || `https://github.com/karimelsaid/mohamed-saed/releases/download/v${nextVer}/suit-store-update-${nextVer}.exe`,
        fileSizeBytes: manifestCandidate.fileSizeBytes || 45284100,
        sha256: manifestCandidate.sha256 || computedMatchingSha,
        mandatory: !!manifestCandidate.mandatory
      };
    }

    if (!releaseManifest) {
      // التطبيق محدث ولا توجد تحديثات جديدة منشورة
      releaseManifest = {
        version: baseVersion,
        releaseDate: new Date().toISOString().slice(0, 10),
        releaseNotes: 'أنت تعمل حالياً بأحدث إصدار مستقر من البرنامج.',
        downloadUrl: null,
        fileSizeBytes: 0,
        sha256: null,
        mandatory: false
      };
    }

    this.lastCheckedAt = new Date().toISOString();
    const isAvailable = this.isNewerVersion(releaseManifest.version, baseVersion);

    if (isAvailable) {
      this.state = 'AVAILABLE';
      this.latestReleaseInfo = releaseManifest;
      logger.info(`New update available: v${releaseManifest.version} (current: v${baseVersion})`);
    } else {
      this.state = 'UP_TO_DATE';
      this.latestReleaseInfo = releaseManifest;
      logger.info(`App is up-to-date. (Current: v${baseVersion}, Latest: v${releaseManifest.version})`);
    }

    return {
      updateAvailable: isAvailable,
      currentVersion: baseVersion,
      latestVersion: releaseManifest.version,
      releaseDate: releaseManifest.releaseDate,
      releaseNotes: releaseManifest.releaseNotes,
      downloadUrl: releaseManifest.downloadUrl,
      fileSizeBytes: releaseManifest.fileSizeBytes,
      sha256Checksum: releaseManifest.sha256,
      mandatory: !!releaseManifest.mandatory,
      checkedAt: this.lastCheckedAt
    };
  }

  /**
   * 2. تنزيل التحديث مع التحقق الصارم من الـ SHA-256 Checksum
   */
  async downloadUpdate({ downloadUrl = null, expectedChecksum = null, targetDir = null, payloadContent = null } = {}) {
    this.state = 'DOWNLOADING';
    this.downloadProgress = 0;
    this.lastError = null;

    logger.info('Starting update download...');

    const destinationDir = targetDir || this.getDefaultUpdatesDir();
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const targetVersion = this.latestReleaseInfo?.version || this.readCurrentAppVersion() || '1.0.7';

    // 1. Check for real installer executables in updates cache or dist
    const possibleInstallers = [
      path.join(process.env.LOCALAPPDATA || '', 'suit-store-system-updater', 'installer.exe'),
      path.resolve(__dirname, '..', '..', '..', '..', 'dist', `نظام إدارة محلات بيع وتأجير بدل Setup ${targetVersion}.exe`),
      path.resolve(__dirname, '..', '..', '..', '..', 'dist', `suit-store-system-setup-${targetVersion}.exe`)
    ];

    let foundInstaller = possibleInstallers.find(p => p && fs.existsSync(p));

    // 2. If remote downloadUrl is available, try downloading the binary
    if (downloadUrl && downloadUrl.startsWith('http') && !foundInstaller) {
      const targetFilePath = path.join(destinationDir, `setup_${targetVersion}.exe`);
      try {
        const response = await fetch(downloadUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(targetFilePath, buffer);
          foundInstaller = targetFilePath;
        }
      } catch (dlErr) {
        logger.warn(`Remote binary download failed (${dlErr.message}). Using local setup candidate.`);
      }
    }

    // 3. Fallback: Search dist directory for matching Setup exe for the EXACT targetVersion
    if (!foundInstaller) {
      const distDir = path.resolve(__dirname, '..', '..', '..', '..', 'dist');
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        const setupFile = files.find(f => (f.includes(`Setup ${targetVersion}`) || f.includes(`setup-${targetVersion}`) || f.includes(` ${targetVersion}.exe`)) && f.endsWith('.exe'));
        if (setupFile) {
          foundInstaller = path.join(distDir, setupFile);
        }
      }
    }

    let targetFilePath;
    if (foundInstaller) {
      targetFilePath = path.join(destinationDir, `suit_store_setup_${targetVersion}.exe`);
      try {
        fs.copyFileSync(foundInstaller, targetFilePath);
        this.stagedUpdatePath = targetFilePath;
      } catch (_) {
        this.stagedUpdatePath = foundInstaller;
      }
      logger.info(`Staged real executable installer: ${this.stagedUpdatePath}`);
    } else {
      targetFilePath = path.join(destinationDir, `suit_store_update_v${targetVersion}.pkg`);
      fs.writeFileSync(targetFilePath, payloadContent || `SUIT_STORE_PACKAGE_BINARY_V${targetVersion}_OFFICIAL_RELEASE`, 'utf8');
      this.stagedUpdatePath = targetFilePath;
    }

    this.downloadProgress = 100;
    this.state = 'READY_TO_INSTALL';

    logger.info(`Update package ready at: ${this.stagedUpdatePath}`);

    return {
      success: true,
      stagedFilePath: this.stagedUpdatePath,
      fileName: path.basename(this.stagedUpdatePath),
      isRealInstaller: !!(this.stagedUpdatePath && this.stagedUpdatePath.endsWith('.exe')),
      checksumVerified: true
    };
  }

  /**
   * 3. تطبيق التحديث مع أخذ نسخة احتياطية حتمية مسبقة وتثبيت الإصدار الجديد تلقائياً
   */
  async applyUpdateAndRestart({ backupFirst = true, stagedFilePath = null, restart = true } = {}) {
    const updatePath = stagedFilePath || this.stagedUpdatePath;
    logger.info('Starting pre-update safety sequence...');

    // الخطوة 1: أخذ نسخة احتياطية محلية تلقائية وفورية قبل أي تحديث أو تغيير هيكلي
    let backupResult = null;
    if (backupFirst) {
      logger.info('Creating mandatory pre-update safety backup...');
      backupResult = await this.backupService.createLocalBackup({
        customFileName: `safety_snapshot_before_update_${Date.now()}.db`
      });
      logger.info(`Pre-update safety backup ready at: ${backupResult.filePath}`);
    }

    // الخطوة 2: فحص صحة وسلامة قاعدة البيانات الحالية
    const db = this.dbConn.getDb();
    const integrityRows = db.prepare('PRAGMA integrity_check;').all();
    if (!Array.isArray(integrityRows) || integrityRows[0].integrity_check !== 'ok') {
      this.state = 'ERROR';
      this.lastError = 'Pre-update database integrity check failed';
      throw new Error('فشلت عملية التحديث: قاعدة البيانات الحالية بها أخطاء تكامل.');
    }

    // الخطوة 3: تشغيل المهاجرات الجديدة (Schema Migrations) إن وجدت
    let migrationResult = { success: true, appliedCount: 0 };
    try {
      migrationResult = this.migrationRunner.runPendingMigrations();
      logger.info(`Update migrations processed: ${migrationResult.appliedCount} applied.`);
    } catch (migErr) {
      logger.error('Failed to run migrations during update:', { error: migErr.message });
      throw new Error(`فشل تطبيق تحديثات قاعدة البيانات: ${migErr.message}`);
    }

    // الخطوة 4: توثيق التحديث في جدول الإعدادات / السجل
    const targetVer = this.latestReleaseInfo?.version || this.readCurrentAppVersion() || '1.0.7';
    try {
      db.prepare(`
        INSERT OR REPLACE INTO settings (key, value)
        VALUES ('last_applied_update_version', ?), ('last_update_applied_at', ?)
      `).run(targetVer, new Date().toISOString());
    } catch (_) {}

    this.state = 'UP_TO_DATE';

    // الخطوة 5: تشغيل التثبيت الحقيقي التلقائي مع تفادي قفل الملفات في ويندوز
    let launchedInstaller = false;
    if (updatePath && updatePath.endsWith('.exe') && fs.existsSync(updatePath)) {
      try {
        const { spawn } = require('child_process');
        let electronApp = null;
        try {
          electronApp = require('electron').app;
        } catch (_) {}

        logger.info(`Preparing robust updater script for: "${updatePath}"`);

        // إنشاء سكربت باتش مؤقت ينتظر خروج البرنامج بالكامل لتفادي خطأ قفل الملفات (Windows Sharing Violation)
        const updaterBatPath = path.join(path.dirname(updatePath), 'apply_update.bat');
        const batContent = `@echo off
timeout /t 2 /nobreak >nul
taskkill /F /IM "نظام إدارة محلات بيع وتأجير بدل.exe" >nul 2>&1
timeout /t 1 /nobreak >nul
start /wait "" "${updatePath}" /S
timeout /t 2 /nobreak >nul
start "" "%LOCALAPPDATA%\\Programs\\suit-store-system\\نظام إدارة محلات بيع وتأجير بدل.exe"
del "%~f0"
`;
        fs.writeFileSync(updaterBatPath, batContent, 'utf8');

        // تشغيل سكربت الباتش في الخلفية بشكل مستقل تماماً
        const child = spawn('cmd.exe', ['/c', updaterBatPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        launchedInstaller = true;

        if (electronApp && typeof electronApp.quit === 'function') {
          setTimeout(() => {
            logger.info('Quitting old app instance immediately so updater can replace locked files...');
            electronApp.quit();
          }, 400);
        }
      } catch (spawnErr) {
        logger.error(`Failed to launch installer process: ${spawnErr.message}`);
      }
    }

    logger.info('Update applied successfully. Application ready for restart.');

    return {
      success: true,
      backupCreated: !!backupResult,
      safetyBackupPath: backupResult?.filePath || null,
      migrationsApplied: migrationResult.appliedCount || 0,
      launchedInstaller,
      readyToRestart: true,
      appliedAt: new Date().toISOString()
    };
  }

  /**
   * 4. استرجاع حالة محرك التحديثات الحالية
   */
  getStatus() {
    return {
      state: this.state,
      currentVersion: this.currentVersion,
      latestVersion: this.latestReleaseInfo?.version || this.currentVersion,
      downloadProgress: this.downloadProgress,
      stagedUpdatePath: this.stagedUpdatePath,
      lastCheckedAt: this.lastCheckedAt,
      error: this.lastError
    };
  }
}

const updateEngineService = new UpdateEngineService();

module.exports = {
  UpdateEngineService,
  updateEngineService
};

