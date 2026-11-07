const path = require('path');
const fs = require('fs');
const { DatabaseConnection } = require('../apps/desktop/electron/database/connection');
const { MigrationRunner } = require('../apps/desktop/electron/database/migration-runner');
const { TransactionHelper } = require('../apps/desktop/electron/database/transaction-helper');
const { DatabaseIntegrity } = require('../apps/desktop/electron/database/integrity');
const { BackupApi } = require('../apps/desktop/electron/database/backup-api');
const { SuitUnitRepository } = require('../apps/desktop/electron/database/repositories/suit-unit-repo');
const { BookingRepository } = require('../apps/desktop/electron/database/repositories/booking-repo');
const { FinanceRepository } = require('../apps/desktop/electron/database/repositories/finance-repo');
const { CustomerRepository } = require('../apps/desktop/electron/database/repositories/customer-repo');

let failed = false;
console.log('Testing Phase 3: Database Foundation & Migrations...\n');

// Use a temporary test database file
const testDbPath = path.join(__dirname, '..', 'test-database.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const dbConn = new DatabaseConnection(testDbPath);
const db = dbConn.connect();

async function runTests() {
  try {
    // 1. Test PRAGMAs
    console.log('1. Checking PRAGMA configurations...');
    const fkRow = db.prepare('PRAGMA foreign_keys;').get();
    const fkVal = Object.values(fkRow)[0];
    if (fkVal !== 1) {
      console.error('  ❌ PRAGMA foreign_keys is not ON! Expected 1, got', fkVal);
      failed = true;
    } else {
      console.log('  ✓ PRAGMA foreign_keys is ON (=1)');
    }

    const jmRow = db.prepare('PRAGMA journal_mode;').get();
    const jmVal = Object.values(jmRow)[0].toLowerCase();
    if (jmVal !== 'wal') {
      console.error('  ❌ PRAGMA journal_mode is not WAL! Got', jmVal);
      failed = true;
    } else {
      console.log('  ✓ PRAGMA journal_mode is WAL');
    }

    // 2. Test Migrations
    console.log('\n2. Running Schema Migrations...');
    const runner = new MigrationRunner(dbConn);
    const migRes = runner.runPendingMigrations();
    console.log(`  ✓ Applied migrations count: ${migRes.appliedCount}`);
    const version = runner.getSchemaVersion();
    console.log(`  ✓ Current Schema Version: ${version}`);
    if (!version.includes('001_initial_schema')) {
      console.error('  ❌ Schema version mismatch!');
      failed = true;
    }

    // 3. Test Transaction Rollback
    console.log('\n3. Testing Atomic Transaction Rollback...');
    try {
      TransactionHelper.runInTransaction(db, (tDb) => {
        tDb.prepare("INSERT INTO colors (name, hex_code) VALUES ('لون مؤقت للتراجع', '#112233')").run();
        throw new Error('Simulated intentional transaction error');
      });
    } catch (err) {
      // Check that record was not committed
      const checkRow = db.prepare("SELECT * FROM colors WHERE name = 'لون مؤقت للتراجع'").get();
      if (checkRow) {
        console.error('  ❌ Transaction rollback failed! Row was persisted.');
        failed = true;
      } else {
        console.log('  ✓ Transaction rollback verified: temporary record was safely discarded.');
      }
    }

    // 4. Test Suit Models & Unique Units
    console.log('\n4. Testing Individual Suit Inventory & Unique Barcodes...');
    const suitRepo = new SuitUnitRepository(dbConn);
    const modelId = suitRepo.createModel({
      categoryId: 1,
      code: 'MDL-ROYAL-01',
      name: 'بدلة سموكنج أسود ملكي',
      rentalPrice: 1500,
      securityDeposit: 2000
    });
    console.log(`  ✓ Created Suit Model ID: ${modelId}`);

    const unitId = suitRepo.createUnit({
      suitModelId: modelId,
      sizeId: 3, // Size 50
      warehouseId: 1,
      unitBarcode: 'BARCODE-SUIT-001',
      serialNumber: 'SR-1001'
    });
    console.log(`  ✓ Created Unit ID: ${unitId} with barcode BARCODE-SUIT-001`);

    // Verify duplicate barcode prevention
    try {
      suitRepo.createUnit({
        suitModelId: modelId,
        sizeId: 3,
        warehouseId: 1,
        unitBarcode: 'BARCODE-SUIT-001' // duplicate
      });
      console.error('  ❌ Failed: Duplicate barcode was accepted!');
      failed = true;
    } catch (err) {
      console.log('  ✓ Duplicate barcode properly prevented by UNIQUE constraint.');
    }

    // 5. Test Customer & Booking Conflict Prevention Engine
    console.log('\n5. Testing Booking Engine & Conflict-Free Availability...');
    const custRepo = new CustomerRepository(dbConn);
    const custId = custRepo.createCustomer({
      name: 'أحمد محمود التاجر',
      phone: '01099887766'
    });
    console.log(`  ✓ Created Customer ID: ${custId}`);

    const bookingRepo = new BookingRepository(dbConn);

    // Initial booking: Nov 10 to Nov 15, 2026
    const bId1 = bookingRepo.createBookingWithItems({
      bookingNumber: 'BK-TEST-1001',
      customerId: custId,
      eventDate: '2026-11-13',
      pickupDate: '2026-11-10',
      returnDueDate: '2026-11-15',
      totalRentalAmount: 1500,
      totalDepositAmount: 2000,
      finalAmount: 1500,
      paidAmount: 500
    }, [
      { suitUnitId: unitId, itemType: 'SUIT', rentalPrice: 1500, depositPrice: 2000 }
    ]);
    console.log(`  ✓ Booking 1 created successfully (ID: ${bId1}) for range 2026-11-10 to 2026-11-15`);

    // Conflict booking: Nov 12 to Nov 17, 2026 (Overlaps!)
    console.log('  Testing overlapping booking prevention...');
    try {
      bookingRepo.createBookingWithItems({
        bookingNumber: 'BK-TEST-CONFLICT',
        customerId: custId,
        eventDate: '2026-11-14',
        pickupDate: '2026-11-12',
        returnDueDate: '2026-11-17',
        totalRentalAmount: 1500,
        finalAmount: 1500
      }, [
        { suitUnitId: unitId, itemType: 'SUIT', rentalPrice: 1500 }
      ]);
      console.error('  ❌ Critical Failure: Overlapping booking was NOT prevented!');
      failed = true;
    } catch (err) {
      console.log('  ✓ Conflict Prevention Active: Overlapping booking was rejected:', err.message);
    }

    // Non-overlapping booking: Nov 20 to Nov 25, 2026 -> Should SUCCEED
    const bId2 = bookingRepo.createBookingWithItems({
      bookingNumber: 'BK-TEST-1002',
      customerId: custId,
      eventDate: '2026-11-22',
      pickupDate: '2026-11-20',
      returnDueDate: '2026-11-25',
      totalRentalAmount: 1500,
      finalAmount: 1500
    }, [
      { suitUnitId: unitId, itemType: 'SUIT', rentalPrice: 1500 }
    ]);
    console.log(`  ✓ Non-overlapping Booking 2 created successfully (ID: ${bId2})`);

    // 6. Test Cash Session & Financial Transactions
    console.log('\n6. Testing Cash Session & Financial Accuracy...');
    const financeRepo = new FinanceRepository(dbConn);
    const session = financeRepo.openCashSession(1000, 'SES-TEST-001');
    console.log(`  ✓ Opened Cash Session ID: ${session.id} with opening balance: 1000 EGP`);

    // Cash IN: 500 EGP
    financeRepo.recordCashTransaction(session.id, 'IN', 'RENTAL_ADVANCE', 500, 'BOOKING', bId1);
    // Cash OUT: 200 EGP
    financeRepo.recordCashTransaction(session.id, 'OUT', 'EXPENSE', 200, 'EXPENSE', null, 'فاتورة غسيل');

    // Close Cash Session with counted 1300 EGP
    const closeSummary = financeRepo.closeCashSession(session.id, 1300, 'مطابقة تمام');
    console.log(`  ✓ Cash Session closed with: Calculated=${closeSummary.calculatedBalance}, Actual=${closeSummary.actualBalance}, Diff=${closeSummary.difference}`);
    if (closeSummary.calculatedBalance !== 1300 || closeSummary.difference !== 0) {
      console.error('  ❌ Financial calculations mismatch!');
      failed = true;
    }

    // 7. Test Database Integrity & Backup API
    console.log('\n7. Testing Database Integrity Check & Backup Engine...');
    const integrity = new DatabaseIntegrity(dbConn);
    const checkRes = integrity.checkIntegrity();
    console.log('  ✓ PRAGMA integrity_check result:', checkRes.integrityOk ? 'HEALTHY' : 'FAILED');
    console.log('  ✓ PRAGMA foreign_key_check result:', checkRes.foreignKeysOk ? 'NO VIOLATIONS' : 'FAILED');
    console.log('  ✓ Table statistics:', checkRes.tableStats);

    if (!checkRes.integrityOk || !checkRes.foreignKeysOk) {
      console.error('  ❌ Database integrity check failed!');
      failed = true;
    }

    const backupDir = path.join(__dirname, '..', 'temp-backups');
    const backupApi = new BackupApi(dbConn);
    const backupRes = backupApi.createLocalBackup(backupDir);
    console.log(`  ✓ Backup created at: ${backupRes.fileName} (SHA256: ${backupRes.checksumSha256.slice(0, 16)}...)`);

    const verifyRes = backupApi.verifyBackup(backupRes.filePath);
    console.log('  ✓ Backup file verification result:', verifyRes.valid ? 'VALID & CONSISTENT' : 'CORRUPT');
    if (!verifyRes.valid) {
      console.error('  ❌ Backup verification failed!');
      failed = true;
    }

    // Clean up temporary backup files
    fs.rmSync(backupDir, { recursive: true, force: true });

  } finally {
    dbConn.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  if (failed) {
    console.error('\n❌ Phase 3 Database Foundation tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 3 Database Foundation tests passed with 100% success!');
  }
}

runTests();
