const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseConnection } = require('../apps/desktop/electron/database/connection');
const { MigrationRunner } = require('../apps/desktop/electron/database/migration-runner');

console.log('========================================================');
console.log('  Zeroing Out & Resetting Database to Clean State');
console.log('========================================================\n');

// 1. Resolve standard AppData database path
const baseDir = process.env.APPDATA || path.join(os.homedir(), '.suit-store');
const dataDir = path.join(baseDir, 'SuitStore', 'data');
const dbFile = path.join(dataDir, 'suit-store.db');
const walFile = path.join(dataDir, 'suit-store.db-wal');
const shmFile = path.join(dataDir, 'suit-store.db-shm');

console.log('1. Clearing live SQLite database files...');
try {
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
    console.log(`  ✓ Removed: ${dbFile}`);
  }
  if (fs.existsSync(walFile)) {
    fs.unlinkSync(walFile);
    console.log(`  ✓ Removed: ${walFile}`);
  }
  if (fs.existsSync(shmFile)) {
    fs.unlinkSync(shmFile);
    console.log(`  ✓ Removed: ${shmFile}`);
  }
} catch (err) {
  console.warn(`  Notice: Could not unlink files directly (${err.message}). Will truncate tables instead.`);
}

// 2. Initialize fresh database and run initial schema migrations
console.log('\n2. Initializing clean database with base lookup tables (Categories, Sizes, Colors)...');
const dbConn = new DatabaseConnection(dbFile);
const db = dbConn.connect();
const runner = new MigrationRunner(dbConn);
runner.runPendingMigrations();

// Truncate all business operational tables to guarantee 100% empty state
console.log('\n3. Truncating all operational business tables to zero...');
const tablesToTruncate = [
  'booking_items',
  'booking_status_history',
  'bookings',
  'sale_items',
  'sales_returns_items',
  'sales_returns',
  'sales',
  'payments',
  'cash_transactions',
  'expenses',
  'cash_sessions',
  'suit_unit_history',
  'suit_units',
  'suit_models',
  'stock_ledger',
  'stock_balances',
  'product_variants',
  'products',
  'tasks',
  'notifications',
  'notification_logs',
  'customers',
  'backup_records'
];

db.exec('PRAGMA foreign_keys = OFF;');
for (const table of tablesToTruncate) {
  try {
    db.prepare(`DELETE FROM ${table}`).run();
    try {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = '${table}'`).run();
    } catch (_) {}
    console.log(`  ✓ Cleared table: ${table} (0 records)`);
  } catch (e) {
    console.log(`  Notice for ${table}: ${e.message}`);
  }
}
db.exec('PRAGMA foreign_keys = ON;');

// 3. Clear backups directory
console.log('\n4. Cleaning temporary backup files in backups/...');
const backupsDir = path.join(__dirname, '..', 'backups');
if (fs.existsSync(backupsDir)) {
  const files = fs.readdirSync(backupsDir);
  for (const f of files) {
    if (f.endsWith('.db') || f.endsWith('.sql')) {
      try {
        fs.unlinkSync(path.join(backupsDir, f));
        console.log(`  ✓ Removed backup: ${f}`);
      } catch (_) {}
    }
  }
}

// 4. Verify clean counts
console.log('\n5. Verifying clean state in database:');
const custCount = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
const bookingsCount = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
const unitsCount = db.prepare('SELECT COUNT(*) as count FROM suit_units').get().count;
const productsCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
const sessionsCount = db.prepare('SELECT COUNT(*) as count FROM cash_sessions').get().count;
const tasksCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;

console.log(`  - العملاء (Customers): ${custCount}`);
console.log(`  - الحجوزات (Bookings): ${bookingsCount}`);
console.log(`  - المبيعات (Sales): ${salesCount}`);
console.log(`  - قطع البدل الفردية (Suit Units): ${unitsCount}`);
console.log(`  - المنتجات الكمية (Products): ${productsCount}`);
console.log(`  - ورديات الصندوق (Cash Sessions): ${sessionsCount}`);
console.log(`  - المهام (Tasks): ${tasksCount}`);

dbConn.close();

console.log('\n========================================================');
console.log('✅ ALL DATA RESET TO ZERO SUCCESSFULLY! (CLEAN SLATE)');
console.log('========================================================\n');

