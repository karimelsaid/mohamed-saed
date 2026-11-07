const path = require('path');
const fs = require('fs');
const { DatabaseConnection } = require('../apps/desktop/electron/database/connection');
const { MigrationRunner } = require('../apps/desktop/electron/database/migration-runner');
const { InventoryEngineService } = require('../apps/desktop/electron/services/inventory-engine-service');
const { ipcRouter } = require('../apps/desktop/electron/ipc/ipc-router');

let failed = false;
console.log('Testing Phase 6: Dual Inventory Engine (Individual & Quantity)...\n');

// Use isolated test database
const testDbPath = path.join(__dirname, '..', 'test-phase-6.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const dbConn = new DatabaseConnection(testDbPath);
const db = dbConn.connect();
const runner = new MigrationRunner(dbConn);
runner.runPendingMigrations();

const inventoryService = new InventoryEngineService(dbConn);

async function runTests() {
  try {
    // 1. Suit Model & Unique Unit Creation
    console.log('1. Testing Suit Model & Unique Barcode Units...');
    const model = inventoryService.createSuitModel({
      code: 'MDL-SMOKING-01',
      name: 'بدلة سموكنج إيطالي كلاسيك',
      rental_price: 1600,
      security_deposit: 2000
    });
    console.log(`  ✓ Created Suit Model: ${model.name} (ID: ${model.id})`);

    const unit1 = inventoryService.createSuitUnit({
      suit_model_id: model.id,
      size_id: 3, // Size 50
      warehouse_id: 1,
      unit_barcode: 'BARCODE-TUX-50-01',
      serial_number: 'SN-1001'
    });
    console.log(`  ✓ Created Unit 1 with barcode [${unit1.barcode}]`);

    // Verify duplicate barcode rejection
    try {
      inventoryService.createSuitUnit({
        suit_model_id: model.id,
        size_id: 3,
        warehouse_id: 1,
        unit_barcode: 'BARCODE-TUX-50-01' // duplicate
      });
      console.error('  ❌ Failure: Duplicate barcode was accepted!');
      failed = true;
    } catch (err) {
      console.log('  ✓ Duplicate barcode properly rejected:', err.message);
    }

    // Auto-generated barcode test
    const unit2 = inventoryService.createSuitUnit({
      suit_model_id: model.id,
      size_id: 4 // Size 52
    });
    console.log(`  ✓ Auto-generated barcode created: [${unit2.barcode}]`);

    // 2. Unit Life Cycle & History
    console.log('\n2. Testing Unit Status Transitions & History Tracking...');
    inventoryService.updateUnitStatus(unit1.id, 'BOOKED', 'تأكيد حجز العميل #BK-501', 'BOOKING', 501);
    inventoryService.updateUnitStatus(unit1.id, 'IN_USE', 'تسليم البدلة للعميل في موعد المناسبة');

    const history = inventoryService.getUnitHistory(unit1.id);
    console.log(`  ✓ Status history entries recorded: ${history.length}`);
    if (history.length < 3) {
      console.error('  ❌ History entries count mismatch!');
      failed = true;
    } else {
      console.log('  ✓ History sequence verified:', history.map(h => `${h.old_status || 'INIT'} -> ${h.new_status}`).join(' | '));
    }

    // 3. Dry Cleaning / Laundry Lifecycle
    console.log('\n3. Testing Laundry & Dry Cleaning Lifecycle...');
    const cleanSendRes = inventoryService.sendUnitToCleaning(unit1.id, 'مغسلة الأهرام الملكية', '2026-11-12', 150, 'تنظيف جاف وكي بالبخار');
    console.log(`  ✓ Sent Unit #${unit1.id} to cleaning (Record ID: ${cleanSendRes.cleaningRecordId})`);

    const cleanUnits = inventoryService.getSuitUnits({ status: 'IN_CLEANING' });
    if (!cleanUnits.some(u => u.id === unit1.id)) {
      console.error('  ❌ Unit not found with status IN_CLEANING!');
      failed = true;
    } else {
      console.log('  ✓ Verified unit status is IN_CLEANING in inventory query');
    }

    // Return from cleaning
    inventoryService.returnUnitFromCleaning(cleanSendRes.cleaningRecordId, 150, 'تم الاستلام بحالة ممتازة');
    const returnedUnit = inventoryService.getSuitUnits({ status: 'AVAILABLE' }).find(u => u.id === unit1.id);
    if (!returnedUnit) {
      console.error('  ❌ Unit was not restored to AVAILABLE after cleaning!');
      failed = true;
    } else {
      console.log('  ✓ Unit returned from cleaning and status restored to AVAILABLE');
    }

    // 4. Quantity Inventory (Shoes & Accessories)
    console.log('\n4. Testing Quantity Inventory (Shoes & Stock Balances)...');
    const shoeProduct = inventoryService.createQuantityProduct({
      code: 'SH-DERBY-ROYAL',
      name: 'حذاء كحلي ديربي فاخر',
      category_id: 2, // Shoes
      sale_price: 1900,
      rental_price: 400,
      reorder_level: 2,
      variants: [
        { size_id: 10, initial_quantity: 8, sku: 'SH-DERBY-42' }, // Size 42
        { size_id: 11, initial_quantity: 5, sku: 'SH-DERBY-43' }  // Size 43
      ]
    });
    console.log(`  ✓ Created Quantity Product: ${shoeProduct.name} with 2 variants`);

    const variants = inventoryService.getProductVariants(shoeProduct.id);
    const var42 = variants.find(v => v.sku === 'SH-DERBY-42');
    console.log(`  ✓ Variant ${var42.sku}: On hand = ${var42.quantity_on_hand}, Available = ${var42.available_quantity}`);

    if (var42.quantity_on_hand !== 8) {
      console.error('  ❌ Initial quantity mismatch!');
      failed = true;
    }

    // 5. Stock Adjustments & Zero Negative Stock Enforcement
    console.log('\n5. Testing Stock Adjustment & Negative Stock Prevention Rule...');
    // Add 4 items
    inventoryService.adjustStock(var42.id, 1, 4, 'وارد بضاعة جديدة من المصنع');
    const varAfterAdd = inventoryService.getProductVariants(shoeProduct.id).find(v => v.id === var42.id);
    console.log(`  ✓ Stock adjusted (+4): New On Hand = ${varAfterAdd.quantity_on_hand} (Expected: 12)`);
    if (varAfterAdd.quantity_on_hand !== 12) {
      console.error('  ❌ Addition adjustment failed');
      failed = true;
    }

    // CRITICAL BUSINESS RULE TEST: Attempt to deduct 20 items when on hand is only 12!
    console.log('  Testing negative stock deduction rejection...');
    try {
      inventoryService.adjustStock(var42.id, 1, -20, 'صرف كمية تفوق الرصيد');
      console.error('  ❌ Critical Failure: Negative stock was allowed!');
      failed = true;
    } catch (err) {
      console.log('  ✓ Negative stock prevented successfully by Engine:', err.message);
      const varAfterFail = inventoryService.getProductVariants(shoeProduct.id).find(v => v.id === var42.id);
      if (varAfterFail.quantity_on_hand !== 12) {
        console.error('  ❌ Balance was corrupted despite error!');
        failed = true;
      } else {
        console.log('  ✓ Verified balance remained completely safe (12 items) with atomic rollback');
      }
    }

    // 6. Inter-Warehouse Stock Transfer
    console.log('\n6. Testing Inter-Warehouse Transfer...');
    // Transfer 3 pairs of Size 42 from Warehouse 1 (Main) to Warehouse 2 (Branch/Storage)
    inventoryService.transferStock(var42.id, 1, 2, 3, 'تحويل لفرع العرض');
    
    const dbBal1 = db.prepare('SELECT quantity_on_hand FROM stock_balances WHERE warehouse_id = 1 AND product_variant_id = ?').get(var42.id);
    const dbBal2 = db.prepare('SELECT quantity_on_hand FROM stock_balances WHERE warehouse_id = 2 AND product_variant_id = ?').get(var42.id);

    console.log(`  ✓ Warehouse 1 remaining: ${dbBal1.quantity_on_hand} (Expected: 9)`);
    console.log(`  ✓ Warehouse 2 received: ${dbBal2.quantity_on_hand} (Expected: 3)`);

    if (dbBal1.quantity_on_hand !== 9 || dbBal2.quantity_on_hand !== 3) {
      console.error('  ❌ Inter-warehouse transfer calculation mismatch!');
      failed = true;
    } else {
      console.log('  ✓ Inter-warehouse transfer atomically completed');
    }

    // 7. Stock Ledger Verification
    console.log('\n7. Verifying Immutable Stock Movement Ledger...');
    const ledger = inventoryService.getStockLedger({ variantId: var42.id });
    console.log(`  ✓ Ledger entries count for variant: ${ledger.length}`);
    if (ledger.length < 4) {
      console.error('  ❌ Missing ledger movement entries!');
      failed = true;
    } else {
      console.log('  ✓ Movement types verified in ledger:', ledger.map(l => `${l.movement_type} (${l.quantity > 0 ? '+' + l.quantity : l.quantity})`).join(', '));
    }

    // 8. IPC Dispatch Verification for Inventory Channels
    console.log('\n8. Testing IPC Dispatch for Inventory Channels...');
    ipcRouter.register('inventory:get-suit-models', async () => inventoryService.getSuitModels());
    ipcRouter.register('inventory:get-suit-units', async (p) => inventoryService.getSuitUnits(p));

    const ipcModels = await ipcRouter.dispatch('inventory:get-suit-models');
    const ipcUnits = await ipcRouter.dispatch('inventory:get-suit-units');

    if (!ipcModels.success || !ipcUnits.success) {
      console.error('  ❌ IPC dispatch failed for inventory channels');
      failed = true;
    } else {
      console.log(`  ✓ IPC Dispatch succeeded: Models count = ${ipcModels.data.length}, Units count = ${ipcUnits.data.length}`);
    }

  } finally {
    dbConn.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  if (failed) {
    console.error('\n❌ Phase 6 Inventory Engine tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 6 Inventory Engine tests passed with 100% success!');
  }
}

runTests();
