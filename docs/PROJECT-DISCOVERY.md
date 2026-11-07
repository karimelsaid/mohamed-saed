# تقرير الفحص والتخطيط الأولي (Project Discovery & Planning)
**المشروع:** نظام إدارة محلات بيع وتأجير بدل العرائس (Suit Store Management System)  
**المرحلة:** المرحلة 0 (Phase 0: Discovery & Planning)  
**التاريخ:** 2026-11-08  
**الحالة:** مكتمل وموثق  

---

## 1. فحص بيئة العمل الحالية (Workspace & Environment Discovery)

### 1.1 حالة المجلد وملفات المشروع القائمة
- **مسار المشروع:** `c:\Users\karim\OneDrive\Desktop\mohamed saed`
- **الملفات السابقة الموجودة:** فقط ملف مواصفات المشروع الشامل `MASTER-PROJECT-SPEC.md` (بحجم ~63KB، 2265 سطر).
- **نظام التحكم بالإصدارات:** لم يكن مهيئًا، وتم تشغيل `git init` لتتبع كل التغييرات والمراحل بصورة دقيقة.
- **ملفات الحزم السابقة:** لا يوجد `package.json` أو ملفات تثبيت مسبقة، مما يعني أن بيئة المشروع نظيفة تمامًا وتسمح بالبناء الهندسي السليم دون شوائب أو تعارضات كود قديم.

### 1.2 بيئة النظام والأدوات (Host Environment & Toolchain)
- **نظام التشغيل:** Windows (x64)
- **إصدار Node.js:** `v26.13.0`
- **إصدار npm:** `11.6.2`
- **إصدار Python:** `3.14.7`
- **أدوات البناء المترجمة (C++ Build Tools / MSVC):** غير متوفرة في متغير البيئة `PATH` (`cl.exe` و `msbuild.exe` غير موجودين).
- **النتيجة التقنية المباشرة:**
  - بما أن أدوات تجميع C++ الأصلية غير مثبتة في مسار النظام، فإن أي اعتماد مباشر على تجميع Native C++ Addons من السورس كود سيفشل أثناء التثبيت إذا لم تتوفر حزم ثنائية جاهزة (Prebuilt Binaries).
  - بالتالي، وفقًا للبند 3.1 في كراسة الشروط: (`better-sqlite3 إذا ثبت توافقه مع نسخة Electron وبيئة البناء`)، سيتم تصميم طبقة اتصال قاعدة البيانات بنمط المحول (Database Adapter Pattern) بحيث تستخدم حزم ثنائية مطابقة تمامًا لـ Electron ABI، أو محرك SQLite المعتمد مع توفير مسار Fallback آمن وموثوق لضمان العمل تحت أي ظرف دون تعطل التطبيق أو توقفه.

---

## 2. تقييم التقنيات والمعمارية المقترحة (Architecture & Tech Stack)

### 2.1 الـ Frontend (Renderer)
- **الإطار:** Angular (Standalone Components)
- **المعايير:**
  - Standalone Architecture (بدون NgModules غير الضرورية).
  - Strict TypeScript Mode.
  - دعم أصيل لـ RTL واللغة العربية ونظام سمات داكن/فاتح (Dark/Light Mode).
  - تجريد كامل عن Electron / Node.js API (فصل تام ومنع الوصول المباشر لـ Node أو SQLite).
  - تصميم متجاوب لسطح المكتب بمكونات قابلة لإعادة الاستخدام (Design System).

### 2.2 الـ Desktop Runtime
- **الإطار:** Electron
- **الأمان:**
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true` (مع حماية Preload API عبر `contextBridge`)
  - تقييد قنوات IPC بقائمة بيضاء صارمة ومطابقة لعقود Typed DTOs.

### 2.3 الـ Backend Logic & Repositories
- **المعالجة:** Electron Main Process عبر طبقات الخدمات (Services) ومستودعات البيانات (Repositories).
- **الخدمات المنفصلة:**
  - `InventoryService`, `SuitUnitService`, `BookingService`, `RentalService`
  - `SalesService`, `CustomerService`, `InvoiceService`, `FinancialService`
  - `CashService`, `TaskService`, `NotificationService`, `BackupService`
  - `UpdateService`, `SettingsService`, `ReportsService`
- **إدارة المعاملات:** استخدام SQLite Transactions لجميع العمليات المالية والمخزنية متعددة الجداول.

### 2.4 هيكل مجلدات المشروع (Monorepo Layout)
```text
suit-store-system/
├── README.md
├── package.json
├── docs/
│   ├── EXECUTION-STATUS.md
│   ├── PROJECT-DISCOVERY.md
│   ├── 00-PRODUCT-VISION.md إلى 14-EDITOR-RULES.md
│   ├── pages/
│   └── modules/
├── apps/
│   ├── desktop/
│   │   ├── electron/
│   │   │   ├── main/
│   │   │   ├── preload/
│   │   │   ├── ipc/
│   │   │   ├── services/
│   │   │   └── database/
│   │   └── renderer/ (Angular)
│   └── recovery-tool/
├── packages/
│   ├── shared/
│   └── contracts/
└── scripts/
```

---

## 3. سجل المخاطر واستراتيجيات الاحتواء (Risk Log & Mitigations)

| # | الخطر (Risk) | مستوى التأثير | استراتيجية المعالجة والاحتواء (Mitigation Strategy) |
|---|---|---|---|
| 1 | توافق Node 26 مع Electron Native Modules على Windows | مرتفع | بناء طبقة تجريد `DatabaseDriver` تدعم Prebuilt Binaries أو SQLite Engine مستقل لتفادي مشاكل Native C++ Compilation. |
| 2 | تعارض الحجوزات المزدوجة للبدل الفردية | فائق الخطورة | فحص التوفر الذري عبر SQLite Transactions مع قيود وفهارس فريدة تمنع حجز نفس الوحدة في فترات متداخلة. |
| 3 | سلامة العمليات المالية والصندوق | فائق الخطورة | منع الحذف النهائي، اعتماد نظام تدقيق الحركات (Audit / Ledger) مع مطابقة فورية لأرصدة الخزينة. |
| 4 | انقطاع الكهرباء أو إغلاق التطبيق المفاجئ | مرتفع | تفعيل `WAL Mode` (Write-Ahead Logging) في SQLite وعمليات النسخ الاحتياطي التلقائي عند الإغلاق وبداية التشغيل. |
| 5 | جودة الطباعة العربية (A4 و 80mm) | متوسط | استخدام قوالب HTML/CSS مخصصة للطباعة مع خطوط عربية مدمجة وأحجام دقيقة دون الاعتماد على خطوط النظام الخارجية. |

---

## 4. خطة المراحل المعتمدة (Approved Execution Roadmap)

- **المرحلة 0: Discovery & Planning** (الوضع الحالي - مكتملة ومختبرة)
- **المرحلة 1: Documentation** (إنشاء كامل ملفات التوثيق الفنية والتفصيلية)
- **المرحلة 2: Project Foundation** (تهيئة المشروع، بيئة التطوير، Electron Main + Preload + Angular Scaffold + Typed IPC)
- **المرحلة 3: Database Foundation** (محرك SQLite، الجداول، المهاجرات، Repositories، المعاملات، الاختبارات)
- **المرحلة 4: Design System** (نظام التصميم العربي RTL، المكونات المشتركة، الثيمات، الحالات المختلفة)
- **المرحلة 5: Administration & Settings** (إدارة البيانات الأساسية، الأقسام، المقاسات، الألوان، السياسات)
- **المرحلة 6: Inventory Engine** (محرك المخزون الكمي والفردي، تتبع البدل والوحدات وسجل الحركات)
- **المرحلة 7: Customers & Booking Engine** (إدارة العملاء، محرك الحجوزات، منع التعارض، دورة حياة التأجير)
- **المرحلة 8: POS & Sales** (نقطة البيع المباشر للأحذية والإكسسوارات، الفواتير، المرتجعات)
- **المرحلة 9: Financial Engine** (المحرك المالي، المدفوعات، الصندوق، المصروفات، التسويات)
- **المرحلة 10: Tasks & Notifications** (إدارة المهام، تنبيهات التأخير والتسليم، قوالب WhatsApp)
- **المرحلة 11: Reports** (التقارير المالية والتشغيلية والمخزنية ومطابقتها)
- **المرحلة 12: Printing** (محرك الطباعة للفواتير A4 و 80mm وعقود الإيجار)
- **المرحلة 13: Backup & Restore** (محرك النسخ الاحتياطي المحلي، التشفير، أداة الاستعادة المستقلة)
- **المرحلة 14: Auto Update** (نظام التحديثات الآمن وحماية البيانات)
- **المرحلة 15: Security & QA** (مراجعة الأمان الشاملة، اختبارات E2E والتكامل والأداء)
- **المرحلة 16: Final Build** (بناء تطبيق Windows النهائي NSIS والتحقق الشامل)

---

## 5. معايير اجتياز المرحلة 0 (Phase 0 Acceptance Verification)
- [x] فحص محتويات المجلد والتأكد من عدم حذف أو فقد أي ملفات.
- [x] فحص إصدارات Node.js و npm وأدوات النظام.
- [x] تقييم المخاطر وتحديد الحلول المعمارية للمحركات وقاعدة البيانات.
- [x] تهيئة مستودع Git لحفظ وتتبع التقدم.
- [x] إعداد ملف `docs/PROJECT-DISCOVERY.md`.
- [x] إعداد ملف `docs/EXECUTION-STATUS.md`.
- [x] إنشاء ملف `README.md` يوضح الرؤية والمعمارية.
