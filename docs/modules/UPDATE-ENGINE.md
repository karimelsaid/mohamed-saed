# وثيقة مواصفات المحرك: محرك التحديث التلقائي الآمن (Auto-Update Engine)
**المسار في النظام:** `modules/UPDATE-ENGINE.md`  
**المرحلة:** Phase 1 (Documentation)  

---

## 1. المسؤولية والدور المعماري (Role & Architectural Responsibility)
إدارة تحديثات التطبيق على أجهزة المستخدمين دون المساس بقاعدة البيانات أو بيانات المتجر المخزنة محلياً.

## 2. المكونات والخدمات المرتبطة (Components & Repositories)
- `UpdateService`
- `MigrationRunner`
- `ElectronUpdaterAdapter`
- `IntegrityChecker`

## 3. المعاملات والاتساق (Transactions & Concurrency)
أخذ نسخة احتياطية حتمية قبل تطبيق أي تحديث؛ تشغيل مهاجرات قاعدة البيانات داخل Transaction مع ميزة التراجع التلقائي (Rollback) عند أي خطأ.

## 4. القواعد الحاكمة (Engine Rules)
لا يتم اعتماد التحديث إلا بعد فحص البصمة الرقمية وسلامة الترحيل واجتياز اختبار الصحة (Health Check).

## 5. الواجهات البرمجية الأساسية (Public API & Signatures)
```typescript
checkForUpdates(): Promise<UpdateCheckResult>
downloadUpdate(): Promise<void>
applyUpdateAndRestart(): Promise<void>
runPendingMigrations(): Promise<MigrationResult>
verifyDatabaseHealth(): Promise<boolean>
```

## 6. استراتيجية التعافي من الأخطاء (Failure Recovery)
- استخدام Transactions لضمان إما النجاح الكامل أو التراجع التام (All-or-Nothing).
- تسجيل تفاصيل الأخطاء في `activity_logs` و `system_errors` دون كشف معلومات حساسة.
- الحفاظ على سلامة ملف SQLite وتفعيل WAL Mode لتفادي تلف البيانات عند انقطاع التيار المفاجئ.

## 7. متطلبات الاختبار والاعتماد (Testing & Quality Gates)
- [ ] اختبارات الوحدات لجميع الدوال الحسابية والمخزنية.
- [ ] اختبارات التكامل مع قاعدة بيانات SQLite تجريبية.
- [ ] محاكاة أخطاء الانقطاع والتحقق من التراجع التلقائي بنجاح.
