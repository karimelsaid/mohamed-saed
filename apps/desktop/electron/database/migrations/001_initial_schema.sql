-- ============================================================================
-- 001_initial_schema.sql - Suit Store Management System
-- Comprehensive SQLite Database Schema with Foreign Keys, Indexes & Constraints
-- ============================================================================

-- 1. System & Owner
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS owner_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- 2. Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Product Catalog (Categories, Sizes, Colors)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'SUITS', 'SHOES', 'ACCESSORIES', 'CUSTOM'
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_type TEXT NOT NULL, -- 'SUIT', 'SHOE', 'SHIRT'
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(category_type, code)
);

CREATE TABLE IF NOT EXISTS colors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  hex_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- 4. Quantity Products (Shoes & Accessories)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sale_price REAL NOT NULL DEFAULT 0.0,
  rental_price REAL NOT NULL DEFAULT 0.0,
  cost_price REAL NOT NULL DEFAULT 0.0,
  reorder_level INTEGER NOT NULL DEFAULT 2,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_id INTEGER REFERENCES sizes(id),
  color_id INTEGER REFERENCES colors(id),
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  additional_price REAL NOT NULL DEFAULT 0.0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stock_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(warehouse_id, product_variant_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  movement_type TEXT NOT NULL, -- 'PURCHASE', 'SALE', 'RENTAL_OUT', 'RENTAL_IN', 'ADJUSTMENT', 'TRANSFER'
  quantity INTEGER NOT NULL,
  reference_type TEXT, -- 'SALE', 'BOOKING', 'ADJUSTMENT', 'TRANSFER'
  reference_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Individual Inventory (Suit Models & Unique Units)
CREATE TABLE IF NOT EXISTS suit_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  color_id INTEGER REFERENCES colors(id),
  sale_price REAL NOT NULL DEFAULT 0.0,
  rental_price REAL NOT NULL DEFAULT 0.0,
  security_deposit REAL NOT NULL DEFAULT 0.0,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suit_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suit_model_id INTEGER NOT NULL REFERENCES suit_models(id),
  size_id INTEGER NOT NULL REFERENCES sizes(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  unit_barcode TEXT NOT NULL UNIQUE,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'BOOKED', 'IN_USE', 'IN_CLEANING', 'IN_MAINTENANCE', 'DAMAGED', 'RETIRED'
  rental_count INTEGER NOT NULL DEFAULT 0,
  purchase_date TEXT,
  purchase_cost REAL DEFAULT 0.0,
  condition_rating INTEGER DEFAULT 5, -- 1 to 5
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS unit_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suit_unit_id INTEGER NOT NULL REFERENCES suit_units(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cleaning_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suit_unit_id INTEGER NOT NULL REFERENCES suit_units(id),
  cleaner_name TEXT NOT NULL,
  sent_date TEXT NOT NULL,
  expected_return_date TEXT,
  actual_return_date TEXT,
  cost REAL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'IN_CLEANING', -- 'IN_CLEANING', 'RETURNED', 'LOST'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suit_unit_id INTEGER NOT NULL REFERENCES suit_units(id),
  tailor_name TEXT NOT NULL,
  repair_details TEXT NOT NULL,
  cost REAL DEFAULT 0.0,
  sent_date TEXT NOT NULL,
  return_date TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  alt_phone TEXT,
  national_id TEXT,
  address TEXT,
  chest_size REAL,
  waist_size REAL,
  sleeve_length REAL,
  trouser_length REAL,
  shoe_size TEXT,
  is_blacklisted INTEGER NOT NULL DEFAULT 0,
  blacklist_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. Bookings & Rental Life Cycle
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  event_date TEXT NOT NULL,
  fitting_date TEXT,
  pickup_date TEXT NOT NULL,
  return_due_date TEXT NOT NULL,
  actual_return_date TEXT,
  total_rental_amount REAL NOT NULL DEFAULT 0.0,
  total_deposit_amount REAL NOT NULL DEFAULT 0.0,
  discount_amount REAL NOT NULL DEFAULT 0.0,
  final_amount REAL NOT NULL DEFAULT 0.0,
  paid_amount REAL NOT NULL DEFAULT 0.0,
  deposit_paid REAL NOT NULL DEFAULT 0.0,
  deposit_refunded REAL NOT NULL DEFAULT 0.0,
  late_fee REAL NOT NULL DEFAULT 0.0,
  damage_fee REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'FITTING_SCHEDULED', 'PREPARED', 'DELIVERED', 'RETURNED', 'COMPLETED', 'CANCELLED'
  cancellation_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  suit_unit_id INTEGER REFERENCES suit_units(id),
  product_variant_id INTEGER REFERENCES product_variants(id),
  item_type TEXT NOT NULL, -- 'SUIT', 'SHOE', 'ACCESSORY'
  rental_price REAL NOT NULL,
  deposit_price REAL NOT NULL DEFAULT 0.0,
  tailoring_notes TEXT,
  status TEXT NOT NULL DEFAULT 'BOOKED', -- 'BOOKED', 'PREPARED', 'DELIVERED', 'RETURNED', 'DAMAGED'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rental_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  contract_number TEXT NOT NULL UNIQUE,
  terms_and_conditions TEXT NOT NULL,
  customer_id_verified INTEGER NOT NULL DEFAULT 0,
  printed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Direct Sales (POS)
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL DEFAULT 0.0,
  discount REAL NOT NULL DEFAULT 0.0,
  tax REAL NOT NULL DEFAULT 0.0,
  total_amount REAL NOT NULL DEFAULT 0.0,
  paid_amount REAL NOT NULL DEFAULT 0.0,
  change_amount REAL NOT NULL DEFAULT 0.0,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  cash_session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_variant_id INTEGER REFERENCES product_variants(id),
  suit_unit_id INTEGER REFERENCES suit_units(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0.0,
  total_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  total_refund REAL NOT NULL DEFAULT 0.0,
  reason TEXT,
  cash_session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT NOT NULL, -- 'RENTAL', 'SALE', 'RETURN'
  reference_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0.0,
  total REAL NOT NULL,
  paid REAL NOT NULL DEFAULT 0.0,
  due REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  sequence_type TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  current_number INTEGER NOT NULL DEFAULT 1000
);

-- 10. Financial Engine & Cash Sessions
CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_code TEXT NOT NULL UNIQUE,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  opening_balance REAL NOT NULL DEFAULT 0.0,
  total_cash_in REAL NOT NULL DEFAULT 0.0,
  total_cash_out REAL NOT NULL DEFAULT 0.0,
  calculated_balance REAL NOT NULL DEFAULT 0.0,
  actual_balance REAL,
  difference REAL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
  notes TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT NOT NULL UNIQUE,
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  customer_id INTEGER REFERENCES customers(id),
  reference_type TEXT NOT NULL, -- 'BOOKING', 'SALE', 'DEPOSIT'
  reference_id INTEGER NOT NULL,
  payment_type TEXT NOT NULL, -- 'RENTAL_ADVANCE', 'RENTAL_REMAINDER', 'SECURITY_DEPOSIT', 'SALE', 'LATE_FEE'
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_number TEXT NOT NULL UNIQUE,
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  receipt_image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
  transaction_type TEXT NOT NULL, -- 'IN', 'OUT'
  category TEXT NOT NULL, -- 'RENTAL', 'SALE', 'DEPOSIT', 'EXPENSE', 'DEPOSIT_REFUND', 'MANUAL_IN', 'MANUAL_OUT'
  amount REAL NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financial_reversals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reversal_number TEXT NOT NULL UNIQUE,
  original_payment_id INTEGER NOT NULL REFERENCES payments(id),
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Tasks & Notifications
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL, -- 'SUIT_PREPARATION', 'FITTING', 'CLEANING', 'RETURN_FOLLOWUP'
  priority TEXT NOT NULL DEFAULT 'NORMAL', -- 'LOW', 'NORMAL', 'HIGH', 'URGENT'
  due_date TEXT NOT NULL,
  booking_id INTEGER REFERENCES bookings(id),
  suit_unit_id INTEGER REFERENCES suit_units(id),
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_level TEXT NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARNING', 'DANGER'
  is_read INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  phone TEXT NOT NULL,
  message_template TEXT NOT NULL,
  sent_status TEXT NOT NULL DEFAULT 'GENERATED',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Audit & Backup
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backup_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_type TEXT NOT NULL, -- 'LOCAL', 'GOOGLE_DRIVE'
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  is_encrypted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_suit_units_barcode ON suit_units(unit_barcode);
CREATE INDEX IF NOT EXISTS idx_suit_units_status ON suit_units(status);
CREATE INDEX IF NOT EXISTS idx_suit_units_model ON suit_units(suit_model_id);

CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(pickup_date, return_due_date);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE INDEX IF NOT EXISTS idx_booking_items_unit ON booking_items(suit_unit_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items(booking_id);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_session ON cash_transactions(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(cash_session_id);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(product_variant_id);

-- Initial Sequence Seeds
INSERT OR IGNORE INTO invoice_sequences (sequence_type, prefix, current_number) VALUES
  ('INVOICE', 'INV-', 1000),
  ('BOOKING', 'BK-', 1000),
  ('SALE', 'SL-', 1000),
  ('PAYMENT', 'PAY-', 1000),
  ('EXPENSE', 'EXP-', 1000);

-- Initial Warehouses
INSERT OR IGNORE INTO warehouses (id, code, name, location, is_default, is_active) VALUES
  (1, 'MAIN', 'المخزن الرئيسي (المحل)', 'صالة العرض الرئيسية', 1, 1),
  (2, 'CLEANING', 'قسم الدراي كلين والمغسلة', 'القسم الداخلي', 0, 1),
  (3, 'STORAGE', 'مخزن الأمانات والبضاعة الاحتياطية', 'الدور العلوي', 0, 1);

-- Initial Categories
INSERT OR IGNORE INTO categories (id, code, name, type, is_active) VALUES
  (1, 'SUITS', 'بدل رجالي وعرائس', 'SUITS', 1),
  (2, 'SHOES', 'أحذية كلاسيك وعرائس', 'SHOES', 1),
  (3, 'TIES', 'ربطات عنق وببيونات', 'ACCESSORIES', 1),
  (4, 'CUFFLINKS', 'أزرار أكمام وإكسسوارات', 'ACCESSORIES', 1),
  (5, 'SHIRTS', 'قمصان بدل وبدل داخلية', 'ACCESSORIES', 1);

-- Initial Sizes
INSERT OR IGNORE INTO sizes (category_type, code, name, sort_order) VALUES
  ('SUIT', '46', 'مقاس 46', 1),
  ('SUIT', '48', 'مقاس 48', 2),
  ('SUIT', '50', 'مقاس 50', 3),
  ('SUIT', '52', 'مقاس 52', 4),
  ('SUIT', '54', 'مقاس 54', 5),
  ('SUIT', '56', 'مقاس 56', 6),
  ('SUIT', '58', 'مقاس 58', 7),
  ('SHOE', '40', 'مقاس 40', 1),
  ('SHOE', '41', 'مقاس 41', 2),
  ('SHOE', '42', 'مقاس 42', 3),
  ('SHOE', '43', 'مقاس 43', 4),
  ('SHOE', '44', 'مقاس 44', 5),
  ('SHOE', '45', 'مقاس 45', 6);

-- Initial Colors
INSERT OR IGNORE INTO colors (name, hex_code) VALUES
  ('أسود ملكي', '#000000'),
  ('كحلي رويال', '#0A1931'),
  ('رمادي غامق (فحم)', '#333333'),
  ('رمادي فاتح', '#D1D5DB'),
  ('أبيض لؤلؤي', '#FFFFFF'),
  ('نبيتي ديب ريد', '#5C061E');

-- Initial Expense Categories
INSERT OR IGNORE INTO expense_categories (name, description) VALUES
  ('مغسلة ودراي كلين', 'تكاليف تنظيف وكي البدل'),
  ('خياطة وتعديلات', 'أجور الخياط وتعديل مقاسات الزبائن'),
  ('نثريات وضيافة', 'مشروبات ومستلزمات المحل'),
  ('فواتير كهرباء وإنترنت', 'فواتير ومصروفات دورية');

