# وثيقة مواصفات المحرك: محرك النسخ الاحتياطي والاستعادة (Backup & Recovery Engine)
**المسار في النظام:** `modules/BACKUP-ENGINE.md`  
**المرحلة:** Phase 1 (Documentation)  

---

## 1. المسؤولية والدور المعماري (Role & Architectural Responsibility)
إنشاء وحماية نسخ احتياطية كاملة محلياً وسحابياً عبر Google Drive، مع توفير أداة استعادة مستقلة للطوارئ.

## 2. المكونات والخدمات المرتبطة (Components & Repositories)
- `BackupService`
- `RestoreService`
- `GoogleDriveAdapter`
- `EncryptionHelper`

## 3. المعاملات والاتساق (Transactions & Concurrency)
استخدام SQLite Online Backup API لضمان أخذ نسخة سليمة متسقة حتى أثناء عمل التطبيق دون قفل قاعدة البيانات.

## 4. القواعد الحاكمة (Engine Rules)
تشفير النسخ بكلمة مرور؛ فحص سلامة الملف (SHA256) قبل الرفع وبعد التحميل؛ عدم الكتابة فوق قاعدة البيانات النشطة دون تأكيد مزدوج ونسخة وقائية.

## 5. الواجهات البرمجية الأساسية (Public API & Signatures)
```typescript
createLocalBackup(destinationPath, encryptPassword): Promise<BackupManifest>
uploadBackupToGoogleDrive(backupFile, authTokens): Promise<string>
verifyBackupIntegrity(backupFile): Promise<boolean>
restoreFromBackup(backupFile, decryptPassword): Promise<RestoreResult>
listGoogleDriveBackups(): Promise<BackupFileItem[]>
```

## 6. استراتيجية التعافي من الأخطاء (Failure Recovery)
- استخدام Transactions لضمان إما النجاح الكامل أو التراجع التام (All-or-Nothing).
- تسجيل تفاصيل الأخطاء في `activity_logs` و `system_errors` دون كشف معلومات حساسة.
- الحفاظ على سلامة ملف SQLite وتفعيل WAL Mode لتفادي تلف البيانات عند انقطاع التيار المفاجئ.

## 7. متطلبات الاختبار والاعتماد (Testing & Quality Gates)
- [ ] اختبارات الوحدات لجميع الدوال الحسابية والمخزنية.
- [ ] اختبارات التكامل مع قاعدة بيانات SQLite تجريبية.
- [ ] محاكاة أخطاء الانقطاع والتحقق من التراجع التلقائي بنجاح.
