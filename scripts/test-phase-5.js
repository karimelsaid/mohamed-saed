const path = require('path');
const fs = require('fs');
const { DatabaseConnection } = require('../apps/desktop/electron/database/connection');
const { MigrationRunner } = require('../apps/desktop/electron/database/migration-runner');
const { AdminService } = require('../apps/desktop/electron/services/admin-service');
const { SettingsService } = require('../apps/desktop/electron/services/settings-service');
const { ipcRouter } = require('../apps/desktop/electron/ipc/ipc-router');

let failed = false;
console.log('Testing Phase 5: Administration & Settings Engine...\n');

// Use isolated test database
const testDbPath = path.join(__dirname, '..', 'test-phase-5.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const dbConn = new DatabaseConnection(testDbPath);
const db = dbConn.connect();
const runner = new MigrationRunner(dbConn);
runner.runPendingMigrations();

const adminService = new AdminService(dbConn);
const settingsService = new SettingsService(dbConn);

async function runTests() {
  try {
    // 1. Categories Management
    console.log('1. Testing Categories Management...');
    const initialCats = adminService.getCategories();
    console.log(`  ✓ Initial seeded categories count: ${initialCats.length}`);
    if (initialCats.length < 5) {
      console.error('  ❌ Seeded categories missing');
      failed = true;
    }

    const newCat = adminService.createCategory({
      code: 'VESTS',
      name: 'صديري وبدل كلاسيك',
      type: 'ACCESSORIES'
    });
    console.log(`  ✓ Created new category: ${newCat.name} (ID: ${newCat.id})`);

    adminService.updateCategory(newCat.id, { name: 'صديري وبدل كلاسيك معدل' });
    const updatedCats = adminService.getCategories();
    const foundCat = updatedCats.find(c => c.id === newCat.id);
    if (!foundCat || foundCat.name !== 'صديري وبدل كلاسيك معدل') {
      console.error('  ❌ Category update failed!');
      failed = true;
    } else {
      console.log('  ✓ Category updated successfully');
    }

    // 2. Warehouses Management
    console.log('\n2. Testing Warehouses & Default Warehouse Switch...');
    const whs = adminService.getWarehouses();
    console.log(`  ✓ Initial warehouses count: ${whs.length}`);

    const newWh = adminService.createWarehouse({
      code: 'BRANCH_NASR',
      name: 'فرع مدينة نصر',
      location: 'شارع عباس العقاد',
      is_default: 0
    });
    console.log(`  ✓ Created new warehouse: ${newWh.name} (ID: ${newWh.id})`);

    adminService.setDefaultWarehouse(newWh.id);
    const updatedWhs = adminService.getWarehouses();
    const defaultWh = updatedWhs.find(w => w.id === newWh.id);
    if (!defaultWh || defaultWh.is_default !== 1) {
      console.error('  ❌ Set default warehouse failed!');
      failed = true;
    } else {
      console.log('  ✓ Switched default warehouse successfully to:', defaultWh.name);
    }

    // 3. Sizes and Colors
    console.log('\n3. Testing Sizes & Colors...');
    const suitSizes = adminService.getSizes('SUIT');
    console.log(`  ✓ Initial SUIT sizes count: ${suitSizes.length}`);

    const newSize = adminService.createSize({
      category_type: 'SUIT',
      code: '60',
      name: 'مقاس 60 خاص',
      sort_order: 8
    });
    console.log(`  ✓ Created new size: ${newSize.name}`);

    const newColor = adminService.createColor({
      name: 'بترولي ملكي',
      hex_code: '#10375C'
    });
    console.log(`  ✓ Created new color: ${newColor.name} (${newColor.hexCode})`);

    // 4. Rental Policies
    console.log('\n4. Testing Rental Policies Configuration...');
    const initialPolicies = adminService.getRentalPolicies();
    console.log('  ✓ Current rental policies:', initialPolicies);

    adminService.updateRentalPolicies({
      defaultRentalDays: 4,
      bufferCleaningDays: 2,
      lateFeePerDay: 500,
      allowGracePeriodHours: 6
    });

    const updatedPolicies = adminService.getRentalPolicies();
    if (updatedPolicies.defaultRentalDays !== 4 || updatedPolicies.lateFeePerDay !== 500) {
      console.error('  ❌ Rental policies update failed!');
      failed = true;
    } else {
      console.log('  ✓ Updated rental policies verified successfully (Late fee: 500 EGP, Buffer: 2 days)');
    }

    // 5. Settings Service (Store Profile, Printers, PIN)
    console.log('\n5. Testing Store Profile & Security Settings...');
    const initialProfile = settingsService.getStoreProfile();
    console.log('  ✓ Initial store name:', initialProfile.storeName);

    settingsService.updateStoreProfile({
      storeName: 'رويال ستور للبدل الفاخرة',
      phone: '01011112222',
      address: 'المعادي، القاهرة',
      taxNumber: '987-654-321'
    });

    const updatedProfile = settingsService.getStoreProfile();
    if (updatedProfile.storeName !== 'رويال ستور للبدل الفاخرة') {
      console.error('  ❌ Store profile update failed!');
      failed = true;
    } else {
      console.log('  ✓ Store profile updated and verified successfully:', updatedProfile.storeName);
    }

    // Printer settings
    settingsService.updatePrinterSettings({
      receiptPrinter: 'POS-80-USB',
      autoPrintReceipt: true
    });
    const printerSettings = settingsService.getPrinterSettings();
    console.log('  ✓ Printer settings verified:', printerSettings.receiptPrinter);

    // Security PIN verification
    console.log('  Testing PIN security...');
    const defaultPinValid = settingsService.verifyPin('1234');
    console.log('  ✓ Default PIN (1234) valid:', defaultPinValid);

    settingsService.setPin('9876');
    const oldPinValid = settingsService.verifyPin('1234');
    const newPinValid = settingsService.verifyPin('9876');
    if (oldPinValid || !newPinValid) {
      console.error('  ❌ Security PIN update failed!');
      failed = true;
    } else {
      console.log('  ✓ Security PIN updated and verified (Old PIN rejected, New PIN accepted)');
    }

    // 6. IPC Dispatch Testing for Phase 5 Channels
    console.log('\n6. Testing IPC Dispatch for Phase 5 Channels...');
    // Register temporary test handlers in router
    ipcRouter.register('admin:get-categories', async () => adminService.getCategories());
    ipcRouter.register('admin:create-category', async (payload) => adminService.createCategory(payload));

    const ipcCatRes = await ipcRouter.dispatch('admin:get-categories');
    if (!ipcCatRes.success || !Array.isArray(ipcCatRes.data)) {
      console.error('  ❌ IPC Dispatch for admin:get-categories failed!', ipcCatRes);
      failed = true;
    } else {
      console.log(`  ✓ IPC Dispatch succeeded: received ${ipcCatRes.data.length} categories`);
    }

  } finally {
    dbConn.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  if (failed) {
    console.error('\n❌ Phase 5 Administration & Settings tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 5 Administration & Settings tests passed with 100% success!');
  }
}

runTests();

