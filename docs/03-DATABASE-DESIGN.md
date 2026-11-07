# تصميم قاعدة البيانات (Database Design & Schema)
قاعدة البيانات: SQLite مع تفعيل المفاتيح الأجنبية (`PRAGMA foreign_keys = ON`) ونمط التسجيل المسبق (`PRAGMA journal_mode = WAL`).

## 1. الجداول الأساسية
- **النظام والإعدادات:** `settings`, `app_metadata`, `owner_account`
- **المخازن والأماكن:** `warehouses`, `stock_movements`, `stock_balances`, `stock_transfers`
- **المنتجات والتصنيفات:** `categories`, `products`, `product_variants`, `sizes`, `colors`
- **البدل والوحدات الفردية:** `suit_models`, `suit_units`, `unit_status_history`, `cleaning_records`
- **العملاء:** `customers`, `customer_notes`
- **الحجوزات والتأجير:** `bookings`, `booking_items`, `booking_status_history`, `rental_contracts`
- **المبيعات:** `sales`, `sale_items`, `sales_returns`
- **الفواتير والمالية:** `invoices`, `invoice_items`, `payments`, `cash_transactions`, `cash_sessions`, `expenses`
- **المهام والنسخ:** `tasks`, `notifications`, `backup_records`, `activity_logs`

## 2. إدارة الترحيلات (Migrations)
تتم إدارة ترحيل الجداول عبر ملفات SQL مرقمة تصاعديًا (`001_initial_schema.sql`, `002_...`) مع جدول `schema_migrations` لضمان الترقية الآمنة دون فقد أي بيانات.
