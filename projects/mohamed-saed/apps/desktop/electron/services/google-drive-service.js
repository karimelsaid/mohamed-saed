const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dbConnection } = require('../database/connection');
const { logger } = require('../logging/logger');

const CLIENT_ID = '679489814728-vd1r6af36pr3ce06s7btundrikn1vc20.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_PORT = 8585;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

class GoogleDriveService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
    this.authServer = null;
    this.pendingAuthPromise = null;
  }

  /**
   * جلب بيانات المصادقة المخزنة محلياً
   */
  getStoredAuth() {
    try {
      const db = this.dbConn.getDb();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'google_drive_auth'").get();
      if (row && row.value) {
        return JSON.parse(row.value);
      }
    } catch (e) {
      logger.warn(`Could not read google_drive_auth: ${e.message}`);
    }
    return null;
  }

  /**
   * حفظ بيانات المصادقة
   */
  saveAuth(authData) {
    try {
      const db = this.dbConn.getDb();
      const val = JSON.stringify(authData);
      db.prepare(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ('google_drive_auth', ?, 'بيانات اعتماد وتوكن Google Drive', datetime('now', 'localtime'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(val);
      logger.info('Saved Google Drive auth credentials to database.');
    } catch (e) {
      logger.error(`Could not save google_drive_auth: ${e.message}`);
    }
  }

  /**
   * مسح بيانات المصادقة (تسجيل الخروج)
   */
  disconnect() {
    try {
      const db = this.dbConn.getDb();
      db.prepare("DELETE FROM settings WHERE key = 'google_drive_auth'").run();
      logger.info('Google Drive disconnected.');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * فحص حالة الاتصال والحساب المربوط
   */
  async getStatus() {
    const auth = this.getStoredAuth();
    if (!auth || (!auth.refresh_token && !auth.access_token)) {
      return {
        isConnected: false,
        user: null,
        targetFolder: 'MohamedSaed_Store_Backups'
      };
    }

    if (auth.scope && !auth.scope.includes('drive')) {
      return {
        isConnected: false,
        needsReauth: true,
        error: 'صلاحيات Google Drive غير مفعلة (يرجى تسجيل الدخول مجدداً مع تفعيل علامة الصح الخاصة بـ Google Drive)',
        user: auth.user || null,
        targetFolder: 'MohamedSaed_Store_Backups'
      };
    }

    try {
      const token = await this.getValidAccessToken();
      return {
        isConnected: true,
        user: auth.user || { email: 'حساب متصل' },
        targetFolder: 'MohamedSaed_Store_Backups',
        folderId: auth.folderId || null
      };
    } catch (e) {
      logger.warn(`Could not validate Google Drive token: ${e.message}`);
      return {
        isConnected: false,
        error: e.message,
        user: auth.user || null,
        targetFolder: 'MohamedSaed_Store_Backups'
      };
    }
  }

  /**
   * توليد رابط بدء المصادقة
   */
  getAuthUrl() {
    const scopeStr = encodeURIComponent(SCOPES.join(' '));
    const redirectStr = encodeURIComponent(REDIRECT_URI);
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${redirectStr}&response_type=code&scope=${scopeStr}&access_type=offline&prompt=consent&include_granted_scopes=true`;
  }

  /**
   * تشغيل خادم محلي مؤقت لاستلام كود المصادقة بعد موافقة المستخدم
   */
  async startOAuthFlow() {
    if (this.authServer) {
      try { this.authServer.close(); } catch (_) {}
      this.authServer = null;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.authServer) {
          try { this.authServer.close(); } catch (_) {}
          this.authServer = null;
        }
        reject(new Error('انتهت مهلة انتظار تسجيل الدخول (3 دقائق). يرجى المحاولة مجدداً.'));
      }, 180000); // 3 minutes timeout

      this.authServer = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
          if (reqUrl.pathname === '/oauth2callback') {
            const code = reqUrl.searchParams.get('code');
            const error = reqUrl.searchParams.get('error');

            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;">
                  <div style="font-size:50px;">❌</div>
                  <h2>تم إلغاء تسجيل الدخول أو رفض الإذن (${error})</h2>
                  <p style="color:#94a3b8;">يمكنك إغلاق هذه النافذة والمحاولة لاحقاً من البرنامج.</p>
                </body></html>
              `);
              clearTimeout(timeout);
              this.authServer.close();
              this.authServer = null;
              return reject(new Error(`رفض إذن تسجيل الدخول: ${error}`));
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('Missing authorization code');
              return;
            }

            // Exchange code for tokens
            const tokenData = await this.exchangeCodeForTokens(code);
            const userInfo = await this.fetchUserInfo(tokenData.access_token);

            const grantedScope = tokenData.scope || '';
            const hasDriveScope = grantedScope.includes('drive');

            if (!hasDriveScope) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <!DOCTYPE html>
                <html dir="rtl">
                <head>
                  <meta charset="utf-8">
                  <title>تنبيه: يجب تفعيل إذن Google Drive</title>
                </head>
                <body style="font-family:Segoe UI,Tahoma,sans-serif;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;direction:rtl;">
                  <div style="font-size:55px;margin-bottom:15px;">⚠️</div>
                  <h2 style="color:#f59e0b;margin-bottom:12px;">تنبيه: لم يتم تحديد إذن Google Drive!</h2>
                  <p style="color:#cbd5e1;font-size:16px;max-width:550px;margin:0 auto 20px;line-height:1.7;">
                    أثناء تسجيل الدخول، تطلب منك Google الموافقة على الصلاحيات عبر مربعات اختيار.<br>
                    <b>يجب وضع علامة صح (✓) على مربع إذن الوصول لـ Google Drive</b> ليتمكن البرنامج من إنشاء المجلد ورفع النسخ.
                  </p>
                  <div style="background:#1e293b;border:1px solid rgba(245,158,11,0.3);padding:16px;border-radius:10px;max-width:480px;margin:0 auto;color:#94a3b8;font-size:14px;line-height:1.6;">
                    يرجى إغلاق هذه الصفحة الآن، ثم العودة لبرنامج المحل والضغط على <b>تسجيل الدخول بحساب Google</b> مجدداً مع تفعيل علامة الصح.
                  </div>
                </body>
                </html>
              `);

              clearTimeout(timeout);
              setTimeout(() => {
                if (this.authServer) {
                  try { this.authServer.close(); } catch (_) {}
                  this.authServer = null;
                }
              }, 1000);

              return reject(new Error('لم يتم تفعيل إذن الوصول إلى Google Drive أثناء تسجيل الدخول. يرجى تكرار المحاولة والتأكد من تحديد مربع الاختيار (✓) الخاص بـ Google Drive.'));
            }

            const authToSave = {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || (this.getStoredAuth()?.refresh_token),
              expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000),
              scope: tokenData.scope,
              user: userInfo,
              updated_at: new Date().toISOString()
            };

            this.saveAuth(authToSave);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html dir="rtl">
              <head><meta charset="utf-8"><title>تم الربط بنجاح</title></head>
              <body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#f8fafc;">
                <div style="font-size:64px;margin-bottom:12px;">☁️ ✅</div>
                <h2 style="color:#4ade80;margin-bottom:10px;">تم تسجيل الدخول وربط Google Drive بنجاح!</h2>
                <p style="color:#94a3b8;font-size:16px;">مرحباً ${userInfo.name || userInfo.email}، تم اعتماد حسابك بنجاح.</p>
                <p style="color:#cbd5e1;font-size:14px;margin-top:20px;">يمكنك الآن إغلاق هذه الصفحة والعودة لبرنامج المحل لمتابعة الرفع والمزامنة.</p>
                <script>setTimeout(() => window.close(), 4000);</script>
              </body>
              </html>
            `);

            clearTimeout(timeout);
            setTimeout(() => {
              if (this.authServer) {
                this.authServer.close();
                this.authServer = null;
              }
            }, 1000);

            resolve({
              success: true,
              user: userInfo
            });
          }
        } catch (err) {
          logger.error(`Error in OAuth callback: ${err.message}`);
          clearTimeout(timeout);
          if (this.authServer) {
            this.authServer.close();
            this.authServer = null;
          }
          reject(err);
        }
      });

      this.authServer.on('error', (err) => {
        clearTimeout(timeout);
        this.authServer = null;
        reject(new Error(`فشل تشغيل سيرفر المصادقة على المنفذ ${REDIRECT_PORT}: ${err.message}`));
      });

      this.authServer.listen(REDIRECT_PORT, '127.0.0.1', () => {
        logger.info(`OAuth loopback server listening on 127.0.0.1:${REDIRECT_PORT}`);
      });
    });
  }

  /**
   * استبدال الكود بالتوكنات
   */
  async exchangeCodeForTokens(code) {
    const params = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google token exchange failed: ${errText}`);
    }

    return response.json();
  }

  /**
   * جلب معلومات المستخدم
   */
  async fetchUserInfo(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        return {
          email: data.email,
          name: data.name,
          picture: data.picture
        };
      }
    } catch (_) {}
    return { email: 'حساب Google متصل', name: 'مالك المتجر' };
  }

  /**
   * الحصول على Access Token صالح وتجديده تلقائياً إذا انتهت صلاحيته
   */
  async getValidAccessToken() {
    const auth = this.getStoredAuth();
    if (!auth) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

    // If access token is still valid (with 60 seconds buffer)
    if (auth.access_token && auth.expires_at && (auth.expires_at - Date.now() > 60000)) {
      return auth.access_token;
    }

    if (!auth.refresh_token) {
      throw new Error('انتهت صلاحية الجلسة ولا يوجد Refresh Token. يرجى إعادة تسجيل الدخول.');
    }

    // Refresh token
    logger.info('Refreshing expired Google Drive access token...');
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: auth.refresh_token,
      grant_type: 'refresh_token'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`فشل تجديد توكن الوصول: ${err}`);
    }

    const data = await response.json();
    auth.access_token = data.access_token;
    auth.expires_at = Date.now() + ((data.expires_in || 3600) * 1000);
    this.saveAuth(auth);

    return auth.access_token;
  }

  /**
   * إيجاد أو إنشاء مجلد النسخ الاحتياطية على Google Drive
   */
  async getOrCreateBackupFolder(accessToken, folderName = 'MohamedSaed_Store_Backups') {
    try {
      // 1. Search for existing folder
      const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
        }
      }

      // 2. Create folder if not found
      logger.info(`Creating Google Drive folder: ${folderName}`);
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        logger.warn(`Could not create folder '${folderName}' in Drive: ${errText}`);
        if (errText.includes('SERVICE_DISABLED') || errText.includes('has not been used in project')) {
          throw new Error('خدمة Google Drive API غير مفعلة في مشروع Google Cloud. يرجى تفعيلها بالضغط على زر ENABLE من الرابط: https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=679489814728');
        }
        return null;
      }

      const createdData = await createRes.json();
      return createdData.id;
    } catch (err) {
      if (err.message && err.message.includes('غير مفعلة')) {
        throw err;
      }
      logger.warn(`Error in getOrCreateBackupFolder: ${err.message}`);
      return null;
    }
  }

  /**
   * رفع ملف حقيقي بالكامل إلى Google Drive عبر Multipart Upload API
   */
  async uploadBackupFile(filePath, progressCallback = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ملف النسخة الاحتياطية غير موجود: ${filePath}`);
    }

    const accessToken = await this.getValidAccessToken();
    let folderId = null;
    try {
      folderId = await this.getOrCreateBackupFolder(accessToken, 'MohamedSaed_Store_Backups');
    } catch (e) {
      if (e.message && e.message.includes('غير مفعلة')) {
        throw e;
      }
      logger.warn(`Folder lookup/creation fallback: ${e.message}`);
    }

    const fileName = path.basename(filePath);
    const fileStats = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    // Prepare Multipart Related request body
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      description: `نسخة احتياطية لقاعدة بيانات محل بدل محمد السعيد تم إنشاؤها في ${new Date().toLocaleString('ar-EG')}`,
      mimeType: 'application/x-sqlite3'
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
    const mediaHeader = `${delimiter}Content-Type: application/x-sqlite3\r\nContent-Transfer-Encoding: binary\r\n\r\n`;

    const payloadBuffer = Buffer.concat([
      Buffer.from(metadataPart, 'utf-8'),
      Buffer.from(mediaHeader, 'utf-8'),
      fileBuffer,
      Buffer.from(closeDelimiter, 'utf-8')
    ]);

    logger.info(`Starting real Google Drive multipart upload [${fileName}] (${fileStats.size} bytes)${folderId ? ` to folder ID: ${folderId}` : ' to root directory'}`);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink,createdTime';
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(payloadBuffer.length)
      },
      body: payloadBuffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      let parsedErr = {};
      try { parsedErr = JSON.parse(errText); } catch (_) {}

      if (errText.includes('SERVICE_DISABLED') || errText.includes('has not been used in project')) {
        throw new Error('خدمة Google Drive API غير مفعلة في مشروع Google Cloud. يرجى تفعيلها بالضغط على زر ENABLE من الرابط:\nhttps://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=679489814728');
      }

      if (errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
        throw new Error('صلاحيات حساب Google الحالي غير كافية لرفع الملفات إلى Drive. يرجى الضغط على زر "خروج / قطع الاتصال" ثم إعادة تسجيل الدخول والتأكد من تحديد مربع الاختيار الخاص بـ Google Drive.');
      }
      throw new Error(`فشل رفع الملف إلى Google Drive: ${errText}`);
    }

    const uploadedFile = await uploadRes.json();
    logger.info(`Google Drive file uploaded successfully! File ID: ${uploadedFile.id}, Link: ${uploadedFile.webViewLink}`);

    // Record in local database backup_records table
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    try {
      this.dbConn.run(`
        INSERT INTO backup_records (backup_type, file_path, file_size_bytes, checksum_sha256, is_encrypted, status)
        VALUES ('GOOGLE_DRIVE', ?, ?, ?, 0, 'SUCCESS')
      `, [filePath, fileStats.size, checksum]);
    } catch (e) {
      logger.warn(`Could not log backup_records: ${e.message}`);
    }

    return {
      success: true,
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
      fileSizeBytes: Number(uploadedFile.size) || fileStats.size,
      webViewLink: uploadedFile.webViewLink,
      createdTime: uploadedFile.createdTime,
      folderId
    };
  }

  /**
   * جلب قائمة النسخ الاحتياطية المتوفرة على Google Drive
   */
  async listBackupFiles() {
    const accessToken = await this.getValidAccessToken();
    let folderId = null;
    try {
      folderId = await this.getOrCreateBackupFolder(accessToken, 'MohamedSaed_Store_Backups');
    } catch (_) {}

    let query = "trashed = false and (name contains 'suit_store_backup' or mimeType = 'application/x-sqlite3')";
    if (folderId) {
      query = `'${folderId}' in parents and trashed = false`;
    }

    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime,modifiedTime,webViewLink)&orderBy=createdTime desc&pageSize=50`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`فشل جلب قائمة النسخ الاحتياطية من Google Drive: ${errText}`);
    }

    const data = await res.json();
    return (data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      sizeBytes: Number(f.size) || 0,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink
    }));
  }

  /**
   * تنزيل نسخة احتياطية من Google Drive وحفظها محلياً في مجلد النسخ
   */
  async downloadBackupFile(fileId, targetDirectory) {
    if (!fileId) throw new Error('معرف الملف (fileId) مطلوب للتنزيل من Google Drive.');
    if (!fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, { recursive: true });
    }

    const accessToken = await this.getValidAccessToken();

    // 1. Get file metadata (name, size)
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) {
      const err = await metaRes.text();
      throw new Error(`فشل جلب بيانات ملف النسخة من Drive: ${err}`);
    }
    const metadata = await metaRes.json();
    const fileName = metadata.name || `gdrive_backup_${fileId}.db`;
    const targetFilePath = path.join(targetDirectory, fileName);

    logger.info(`Downloading backup file from Google Drive: ${fileName} (File ID: ${fileId})`);

    // 2. Download media content
    const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!downloadRes.ok) {
      const err = await downloadRes.text();
      throw new Error(`فشل تنزيل ملف النسخة من Google Drive: ${err}`);
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(targetFilePath, buffer);

    logger.info(`Downloaded Google Drive backup to: ${targetFilePath} (${buffer.length} bytes)`);

    return {
      filePath: targetFilePath,
      fileName,
      sizeBytes: buffer.length
    };
  }
}

const googleDriveService = new GoogleDriveService();

module.exports = {
  GoogleDriveService,
  googleDriveService
};

