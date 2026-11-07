# المعمارية التقنية (Technical Architecture)
**الهيكل التقني:** Angular Standalone + Electron + Node.js + SQLite

```
Angular Renderer (RTL, Standalone, Signals/Forms)
       ↓
Preload Bridge (contextBridge, Strict Allowlist IPC)
       ↓
Electron Main Process (Application Lifecycle & Native Windows)
       ↓
Application Services (Business Rules, Validation, DTOs)
       ↓
Repositories & Database Layer (SQLite, ACID Transactions, Migrations)
```

## 1. الفصل الصارم للمسؤوليات
- **الواجهة (Renderer):** عرض فقط وإدارة تفاعل المستخدم، لا تملك أي وصول مباشر لـ Node.js أو نظام الملفات أو SQLite.
- **طبقة الأمان (Preload):** تعتمد `contextIsolation: true` و `nodeIntegration: false`.
- **المنطق الخلفي (Node Services):** موجود داخل Main Process ويعالج العمليات داخل Transactions.
- **قاعدة البيانات:** SQLite محلية بتنسيق WAL ومسار حفظ مستقل خارج مجلد التثبيت (`%APPDATA%/SuitStore/data`).
