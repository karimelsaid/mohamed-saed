# نظام إدارة محلات بيع وتأجير بدل  (Suit Store System) 👔💍

> نظام مكتبي احترافي متكامل لإدارة محلات بيع وتأجير بدل  والخطوبة، ومخازن الأحذية والإكسسوارات، ونقاط البيع السريع (POS)، ومحرك الحجوزات المانع للتعارض الزمني، والخزينة المالية المعزولة، وإدارة المهام والطباعة الحرارية والتحديثات الآلية.

[![Completion](https://img.shields.io/badge/Completion-100%25-brightgreen.svg)](#)
[![Phases](https://img.shields.io/badge/Phases-17%20Completed-gold.svg)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-blue.svg)](#)
[![Database](https://img.shields.io/badge/Database-SQLite%20(WAL%20Mode)-orange.svg)](#)
[![Language](https://img.shields.io/badge/Language-Arabic%20RTL-purple.svg)](#)

---

## 🌟 الميزات والمحركات الرئيسية (Core Engines & Capabilities)

### 1. مخزون البدل الفردية (Serialized Individual Suit Units)
- تتبع دقيق لكل قطعة بدلة فردية برقم باركود ورقم تسلسلي فريد (`ST-MODEL-SIZE-RANDOM`).
- تتبع حالة البدلة في دورة حياتها: متاحة (`AVAILABLE`)، محجوزة (`BOOKED`)، قيد الاستخدام (`IN_USE`)، في المغسلة والدراي كلين (`IN_CLEANING`)، تالفة (`DAMAGED`).
- سجل تاريخي وتراكمي لعدد مرات تأجير كل بدلة وإجمالي الإيراد المتحقق منها لحساب العائد على الاستثمار.

### 2. مخزون الأصناف الكمية (Shoes & Accessories Inventory)
- إدارة منتجات الأحذية الكلاسيك، ربطات العنق، أزرار الأكمام، والقمصان بنظام الـ SKUs والمتغيرات (المقاسات والألوان).
- منع الرصيد السالب بشكل صارم وذري في قاعدة البيانات (`ADR-009 Zero Negative Inventory`).
- دفتر حركات المخزون (`Stock Ledger`) لتسجيل المشتريات، المبيعات، التسويات، والنواقص.

### 3. محرك الحجوزات ومنع التعارض الزمني الذري (Booking Engine)
- فحص التوفر الزمني الذري لمنع الحجز المزدوج لأي قطعة في نفس الفترة (`ADR-006 Zero Double-Booking`).
- دورة حياة متكاملة للحجز: مؤكد (`CONFIRMED`)، جاهز للتسليم (`PREPARED`)، مستلم (`DELIVERED`)، مرتجع ومسوى (`COMPLETED`)، ملغي (`CANCELLED`).
- إدارة فترات بروفات الخياطة وتجهيز البدلة والمغسلة.
- حساب آلي لغرامات التأخير اليومية والتعويض عن التلفيات عند استرجاع البدلة.

### 4. نقطة البيع السريع (POS Sales Engine)
- واجهة كاشير سريعة تدعم البحث بالباركود المباشر وفلترة الأصناف.
- دعم البيع المباشر للأصناف الكمية والبدل الفردية المخصصة للبيع مع الخصومات والضرائب.
- إدارة مرتجعات المبيعات مع استرجاع الكميات المخزنية إلى المستودع تلقائياً داخل Transaction ذرية.

### 5. المحرك المالي وعزل الأمانات (Financial Engine & Escrow Isolation)
- إدارة ورديات وجلسات الصندوق اليومية مع الرصيد الافتتاحي وتتبع حركات الدرج الواردة والصادرة.
- احتساب الفارق بين الرصيد الفعلي والمحسوب آلياً (اكتشاف العجز والزيادة).
- **العزل المحاسبي الصارم (ADR-011):** عزل مبالغ التأمين المستردة (الأمانات) تماماً عن الإيرادات التشغيلية وأرباح المتجر.
- تسجيل المصروفات التشغيلية والنثرية (مغاسل، خياطة، فواتير، ضيافة) وخصمها من الخزينة.

### 6. إدارة المهام وتنبيهات واتساب (Tasks & WhatsApp Integration)
- توليد تلقائي لمهام بروفات التعديل وكي البدل ومتابعة متأخرات الإرجاع اليومية.
- محرك قوالب رسائل واتساب مع تطبيع أرقام الهواتف المصرية تلقائياً بصيغة `+20` دولياً ورابط `Click-to-Chat` المباشر.

### 7. التقارير والتحليلات المحاسبية (Reports & Analytics Engine)
- تقرير الأرباح والخسائر الشامل (`P&L`): الإيرادات، المصروفات، مجمل الربح، وصافي الربح وهامش الربحية.
- تقرير جرد وتقييم الأصول: القيمة الرأسمالية لأسطول البدل، وتقييم مخزون الأحذية والإكسسوارات بسعر التكلفة والبيع.
- تقرير نسبة إشغال أسطول البدل (`Occupancy Rate %`) وتحديد الموديلات والمقاسات الأكثر طلباً.
- تقرير كبار العملاء (`Top Customers`) ومعدلات الإنفاق ومؤشرات الالتزام بالمواعيد.

### 8. محرك الطباعة والقوالب (Printing & Document Templates)
- إيصالات حرارية سريعة لنقاط البيع بمقاس 80mm (`Thermal POS Receipts 80mm`).
- فواتير ضريبية ورسمية مفصلة بمقاس A4 (`Official A4 Invoices`).
- عقود تأجير البدل وإقرارات الأمانات بمقاس A4 وفق الشروط القانونية وبنود غرامات التأخير.
- دعم المعاينة المباشرة والطباعة الصامتة (`Silent Printing`) واكتشاف الطابعات المثبتة.

### 9. محرك النسخ الاحتياطي والاستعادة الآمنة (Backup & Recovery Engine)
- نسخ احتياطي محلي فوري وآمن لقاعدة بيانات SQLite عبر أمر `VACUUM INTO` المتوافق مع وضع WAL دون قفل النظام.
- فحص سلامة وتكامل ملف النسخة الاحتياطية تلقائياً (`PRAGMA integrity_check`) وحساب بصمة SHA-256.
- استعادة آمنة مع أخذ لقطة أمان احتياطية فورية (`Safety Snapshot`) قبل أي عملية استبدال للبيانات.
- دعم محاكاة المزامنة السحابية مع Google Drive.

### 10. محرك التحديثات التلقائية (Auto-Update Engine)
- فحص التحديثات الجديدة عبر السيرفر بمقارنة إصدارات `SemVer` بدقة.
- فحص البصمة الرقمية المشفرة (`SHA-256 Checksum`) لحزم التحديث وحذف أي ملف مشبوه فوراً.
- التنزيل والتثبيت وتطبيق مهاجرات قاعدة البيانات (`Migrations`) تلقائياً مع أخذ نسخة وقائية حتمية قبل التطبيق (`ADR-017`).

### 11. الأمان الشامل وضمان الجودة (Security & QA)
- عزل كامل لبيئة سطح المكتب Electron (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `Strict CSP`).
- حماية قنوات IPC عبر قائمة بيضاء موحدة وتحييد هجمات `Prototype Pollution`.
- حصانة تامة من هجمات حقن الاستعلامات (`SQL Injection`) عبر استخدام `Prepared Statements` حصراً.
- قفل الشاشة برمز PIN مشفر بخوارزمية SHA-256.

---

## 🛠️ المواصفات المعمارية والتقنية (Technical Architecture)

| المكون | التقنية المستخدمة |
|---|---|
| **بيئة سطح المكتب** | Electron 30+ (Sandboxed, Context Isolation, Secure IPC) |
| **محرك الخلفية (Main Process)** | Node.js (CommonJS, Clean Architecture, Services Layer) |
| **الواجهة الأمامية (Renderer)** | Vanilla JS / Modular Web Components مع دعم كامل للـ RTL والثيم الداكن |
| **قاعدة البيانات** | SQLite عبر `node:sqlite` المدمج عالي الأداء مع وضع `WAL Mode` و `Foreign Keys = ON` |
| **إدارة المعاملات** | ACID Transactions و SQLite Savepoints مع التراجع التلقائي (`Rollback`) |
| **نظام الطباعة** | محرك قوالب HTML مخصص لـ 80mm حراري و A4 ليزر |
| **نظام التحزيم** | Electron Builder (NSIS Windows Installer + Portable Single Executable) |

---

## 🚀 التشغيل والبدء السريع (Getting Started)

### 1. المتطلبات الأساسية
- تثبيت **Node.js** (إصدار 20 LTS أو أحدث).
- نظام تشغيل **Windows 10 / 11**.

### 2. تثبيت التبعيات
```bash
npm install
```

### 3. تشغيل التطبيق في وضع سطح المكتب (Desktop Electron)
```bash
npm start
# أو
npm run dev
```

### 4. تشغيل خادم التطوير الحي للواجهة (Web Dev Server)
يمكنك معاينة واجهة النظام التفاعلية فوراً على المتصفح عبر:
```bash
npm run dev:web
```
ثم افتح الرابط: `http://localhost:3000`

---

## 🧪 حزمة الاختبارات وضمان الجودة (Quality Gates)

المشروع يتبع معايير الجودة الصارمة؛ كافة المراحل الـ 17 مدعومة باختبارات مؤتمتة بنسبة نجاح 100%:

```bash
# تشغيل حزمة الفحص الشاملة لكافة المراحل (من المرحلة 0 إلى المرحلة 16)
npm test

# تشغيل اختبار مرحلة محددة (على سبيل المثال المرحلة 15 للأمان):
npm run test:phase-15
npm run test:phase-16
```

---

## 📦 البناء والتحزيم للإنتاج (Production Build)

لتوليد حزم التثبيت النهائية لنظام التشغيل Windows:

```bash
# 1. التحقق النحوي وفحص الملفات وبناء المانيفست المشفر في dist/
npm run build

# 2. تحزيم المثبت النهائي (NSIS Installer + Portable EXE) عبر Electron Builder
npm run dist
```

المخرجات ستكون متوفرة في مجلد `dist/`:
- `suit-store-system Setup 1.0.0.exe` (مثبت NSIS احترافي باللغة العربية مع إنشاء اختصارات سطح المكتب وقائمة ابدأ).
- `suit-store-system 1.0.0.exe` (نسخة محمولة تعمل فوراً بدون تثبيت).
- `build-manifest.json` (مانيفست التوزيع المشفر ببصمات SHA-256 لكافة ملفات الإنتاج).

---

## 📁 هيكل المجلدات (Project Directory Structure)

```text
mohamed-saed/
├── apps/
│   └── desktop/
│       ├── electron/
│       │   ├── database/         # SQLite Connection, Migrations & Transaction Helpers
│       │   ├── ipc/              # IPC Router with Allowlist Security & Sanitization
│       │   ├── logging/          # Unified File & Console Logger
│       │   ├── main/             # Electron Main Process & Window Management
│       │   ├── preload/          # Preload Script with Context Bridge
│       │   └── services/         # Business Engines (Inventory, Booking, POS, Finance, etc.)
│       └── renderer/
│           ├── index.html        # Main App Layout (Arabic RTL)
│           ├── styles.css        # Luxury Design System (Tailwind-like tokens, Gold/Navy Dark Theme)
│           └── renderer.js       # Interactive Front-End Controller
├── build-resources/              # Windows App Icons (icon.ico, icon.png)
├── dist/                         # Production Build Artifacts & Manifests
├── docs/                         # Comprehensive Technical Specs (36 Documentation Files)
│   ├── EXECUTION-STATUS.md       # Master Progress Tracking & 19 ADRs Log
│   ├── PROJECT-DISCOVERY.md      # Initial Project Discovery & Roadmap
│   ├── pages/                    # UI Specs for all 13 Pages
│   └── modules/                  # Technical Specs for all 6 Modules
├── packages/
│   ├── contracts/                # Typed IPC Channels & Contracts
│   └── shared/                   # Shared Enums & Constants
├── scripts/                      # Automated Test Suites for Phases 0 through 16
│   ├── build-desktop.js          # Production Build Pipeline
│   ├── dev-server.js             # Live Web Dev Server
│   ├── generate-icons.js         # Icon Generator
│   ├── test-all-phases.js        # Master Quality Suite (Phases 0-16)
│   └── test-phase-[0-16].js      # Individual Phase Tests
└── package.json                  # Dependencies, Build Scripts & Builder Config
```

---

## 🏆 سجل القرارات المعمارية (Architectural Decision Records)

المشروع مبني على 19 قراراً معمارياً موثقاً بالكامل في [`docs/EXECUTION-STATUS.md`](file:///c:/Users/karim/OneDrive/Desktop/mohamed%20saed/docs/EXECUTION-STATUS.md):
- **ADR-001:** Database Adapter Pattern (SQLite WAL Mode & ACID Transactions).
- **ADR-002:** Strict IPC Sandboxing with Centralized Allowlist.
- **ADR-003:** Sequential Quality Gates Execution.
- **ADR-006:** Zero Double-Booking Collision Detection.
- **ADR-007:** Reusable Modal/Drawer/Toast Design System.
- **ADR-008:** Centralized Key-Value Configuration Store.
- **ADR-009:** Dual Inventory Model with Strict Ledger & Zero Negative Stock.
- **ADR-010:** Nested Transactions via SQLite Savepoints.
- **ADR-011:** Automated Settlement & Security Deposit (Escrow) Isolation.
- **ADR-012:** Atomic POS Direct Sales & Reversible Inventory Movement.
- **ADR-013:** Cash Sessions Lifecycle & Drawer Isolation.
- **ADR-014:** Automated Fitting Tasks & Egyptian WhatsApp Phone Normalization (+20).
- **ADR-015:** Dynamic Asset Valuation & Occupancy Rate Analytics.
- **ADR-016:** Online SQLite Backups via `VACUUM INTO` & Pre-Restore Safety Snapshots.
- **ADR-017:** Mandatory Pre-Update Safety Snapshots & Cryptographic Checksum Enforcement.
- **ADR-018:** Strict Navigation Sandboxing, Prototype Sanitization & Multi-Layer Defense.
- **ADR-019:** Deterministic Build Pipeline, NSIS Packaging & Cryptographic Manifest.

---

## 📄 الترخيص (License)
هذا النظام مخصص حصرياً لإدارة محلات بيع وتأجير بدل  (جميع الحقوق محفوظة 2026).
