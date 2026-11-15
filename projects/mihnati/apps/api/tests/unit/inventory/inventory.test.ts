import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { geographyService } from '../../../src/modules/geography/geography.service.js';
import { taxonomyService } from '../../../src/modules/taxonomy/taxonomy.service.js';
import { InventoryService } from '../../../src/modules/inventory/inventory.service.js';
import { AuditService } from '../../../src/modules/admin/audit.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;
let inventoryService: InventoryService;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e12_inventory',
    MONGODB_DB_NAME: 'mihnati_test_e12_inventory',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('merchant_profiles').deleteMany({});
  await db.collection('stores').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('inventory_movements').deleteMany({});
  await db.collection('inventory_reservations').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});
  await db.collection('governorates').deleteMany({});
  await db.collection('localities').deleteMany({});
  await db.collection('categories').deleteMany({});

  await geographyService.seedIfEmpty();
  await taxonomyService.seedIfEmpty();

  const auditService = new AuditService();
  inventoryService = new InventoryService(auditService);

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E12 Inventory Management & Stock Lifecycle', () => {
  let merchantAToken: string;
  let merchantAId: string;
  let merchantBToken: string;

  let storeAId: string;
  let productA1Id: string;
  let productA2Id: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Get Cairo governorate and product category
    const govs = await geographyService.listGovernorates();
    const cairoGovId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'product' });
    const productCatId = cats[0].id;

    // 2. Register Merchant A
    const mAReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011112222',
      password: 'MerchantPass123!',
      name: 'تاجر التجهيزات الصناعية',
    });
    merchantAId = mAReg.body.data.id;

    const mALogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01011112222',
      password: 'MerchantPass123!',
    });
    merchantAToken = mALogin.body.data.accessToken;

    await request(app)
      .post('/api/v1/me/roles/merchant/activate')
      .set('Authorization', `Bearer ${merchantAToken}`);

    await db.collection('merchant_profiles').updateOne(
      { userId: merchantAId },
      { $set: { verificationStatus: 'verified' } }
    );

    // Create approved store for Merchant A
    const storeRes = await request(app)
      .post('/api/v1/stores/me')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        nameAr: 'متجر التجهيزات الميكانيكية',
        nameEn: 'Mechanical Supplies Store',
        slug: 'mech-supplies-store',
        governorateId: cairoGovId,
        categories: [productCatId],
      });
    storeAId = storeRes.body.data.id;

    // Auto-approve store for test
    await db.collection('stores').updateOne(
      { _id: storeAId },
      { $set: { status: 'active', updatedAt: new Date() } }
    );

    // Create active Product A1 (stockQuantity: 20)
    const pA1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        titleAr: 'طقم مفاتيح إنجليزية أصلي 12 قطعة',
        titleEn: 'Original English Wrench Set 12pcs',
        slug: 'wrench-set-12pcs',
        categoryId: productCatId,
        sku: 'WRNCH-12P-001',
        price: 45000, // 450.00 EGP
        stockQuantity: 20,
      });
    productA1Id = pA1Res.body.data.id;

    // Auto-approve product A1
    await db.collection('products').updateOne(
      { _id: productA1Id },
      { $set: { status: 'active', onHand: 20, reserved: 0, updatedAt: new Date() } }
    );

    // Create active Product A2 (stockQuantity: 5)
    const pA2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        titleAr: 'شنيور دقاق 800 واط صناعي',
        titleEn: 'Industrial Hammer Drill 800W',
        slug: 'hammer-drill-800w',
        categoryId: productCatId,
        sku: 'DRILL-800W-002',
        price: 185000, // 1,850.00 EGP
        stockQuantity: 5,
      });
    productA2Id = pA2Res.body.data.id;

    await db.collection('products').updateOne(
      { _id: productA2Id },
      { $set: { status: 'active', onHand: 5, reserved: 0, updatedAt: new Date() } }
    );

    // 3. Register Merchant B (for IDOR / unauthorized tests)
    await request(app).post('/api/v1/auth/register').send({
      phone: '01033334444',
      password: 'MerchantBPass123!',
      name: 'تاجر منافس',
    });
    const mBLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01033334444',
      password: 'MerchantBPass123!',
    });
    merchantBToken = mBLogin.body.data.accessToken;
  });

  // ══════════════════════════════════════════════════════════════
  // ── Stock Projection & Availability Invariant (E12-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Stock Projection (GET /api/v1/products/:id/inventory)', () => {
    it('returns accurate stock projection (onHand, reserved, available)', async () => {
      const res = await request(app)
        .get(`/api/v1/products/${productA1Id}/inventory`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        productId: productA1Id,
        onHand: 20,
        reserved: 0,
        available: 20,
      });
      expect(res.body.data.updatedAt).toBeDefined();
    });

    it('returns 404 for nonexistent product', async () => {
      const res = await request(app)
        .get('/api/v1/products/non-existent-product-id/inventory');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── Merchant Inventory Adjustments (E12-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Inventory Adjustments (POST /api/v1/products/:id/inventory-adjustments)', () => {
    it('allows merchant to restock product (+30)', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'restock',
          quantity: 30,
          reason: 'وصول شحنة جديدة من المورد الألماني',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        productId: productA1Id,
        onHand: 50,
        reserved: 0,
        available: 50,
      });

      // Confirm DB state
      const db = getDb();
      const prod = await db.collection('products').findOne({ _id: productA1Id });
      expect(prod?.onHand).toBe(50);
      expect(prod?.stockQuantity).toBe(50);
    });

    it('allows merchant to record damaged items (-5)', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'damage',
          quantity: 5,
          reason: 'تلف كرتونة أثناء النقل الداخلي بالمخزن',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        productId: productA1Id,
        onHand: 45,
        reserved: 0,
        available: 45,
      });
    });

    it('allows merchant to record shrinkage / loss (-2)', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'shrinkage',
          quantity: 2,
          reason: 'عجز جرد مفاجئ في الرف رقم 4',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        productId: productA1Id,
        onHand: 43,
        reserved: 0,
        available: 43,
      });
    });

    it('allows merchant to perform audit correction (+7)', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'audit_correction',
          quantity: 7,
          reason: 'تسوية الجرد السنوي الفعلي ومطابقة السجلات',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        productId: productA1Id,
        onHand: 50,
        reserved: 0,
        available: 50,
      });
    });

    it('rejects adjustment that causes available stock to become negative', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'damage',
          quantity: 999, // More than onHand (50)
          reason: 'محاولة تسجيل تلف كمية غير متوفرة بالمخزن',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('negative');
    });

    it('rejects adjustment with missing or too short reason', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'restock',
          quantity: 10,
          reason: 'no', // < 3 chars
        });

      expect(res.status).toBe(400);
    });

    it('rejects non-positive restock quantity', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          type: 'restock',
          quantity: -5,
          reason: 'كمية سالبة غير صالحة',
        });

      expect(res.status).toBe(400);
    });

    it('prevents IDOR: unauthorized merchant cannot adjust another merchant product', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .set('Authorization', `Bearer ${merchantBToken}`)
        .send({
          type: 'restock',
          quantity: 10,
          reason: 'محاولة تعديل منتج متجر آخر دون صلاحية',
        });

      expect(res.status).toBe(403);
    });

    it('requires authentication for inventory adjustments', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productA1Id}/inventory-adjustments`)
        .send({
          type: 'restock',
          quantity: 10,
          reason: 'بدون تسجيل دخول',
        });

      expect(res.status).toBe(401);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── Immutable Movement Ledger & Audit Logs (E12-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Movements Ledger & Audit Trail (GET /api/v1/products/:id/inventory-movements)', () => {
    it('returns complete movement history in reverse chronological order', async () => {
      const res = await request(app)
        .get(`/api/v1/products/${productA1Id}/inventory-movements`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(4); // restock, damage, shrinkage, audit_correction

      const [latest, second, third, oldest] = res.body.data;
      expect(latest.type).toBe('audit_correction');
      expect(latest.quantityDelta).toBe(7);
      expect(latest.onHand).toBe(50);

      expect(second.type).toBe('shrinkage');
      expect(second.quantityDelta).toBe(-2);

      expect(third.type).toBe('damage');
      expect(third.quantityDelta).toBe(-5);

      expect(oldest.type).toBe('restock');
      expect(oldest.quantityDelta).toBe(30);
    });

    it('verifies audit logs were written for inventory adjustments', async () => {
      const db = getDb();
      const logs = await db
        .collection('admin_audit_logs')
        .find({
          targetType: 'product',
          targetId: productA1Id,
          action: 'inventory:adjust',
        })
        .toArray();

      expect(logs.length).toBe(4);
      expect(logs[0].actorId).toBe(merchantAId);
      expect(logs[0].metadata).toHaveProperty('adjustmentType');
    });

    it('prevents IDOR: unauthorized merchant cannot view another merchant movements', async () => {
      const res = await request(app)
        .get(`/api/v1/products/${productA1Id}/inventory-movements`)
        .set('Authorization', `Bearer ${merchantBToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── Reservation Lifecycle: Create, Commit, Release (E12-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('Reservation Lifecycle (Service Direct & CAS)', () => {
    it('creates active reservation, holding stock without reducing onHand', async () => {
      const orderId = 'ord_test_001';
      const items = [{ productId: productA2Id, quantity: 2 }]; // productA2 has onHand: 5, reserved: 0

      const reservations = await inventoryService.createReservations(
        orderId,
        storeAId,
        items,
        15 // 15 minutes hold
      );

      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('active');
      expect(reservations[0].quantity).toBe(2);

      // Check stock projection: onHand remains 5, reserved becomes 2, available becomes 3
      const proj = await inventoryService.getStockProjection(productA2Id);
      expect(proj.onHand).toBe(5);
      expect(proj.reserved).toBe(2);
      expect(proj.available).toBe(3);

      // Check movement recorded
      const db = getDb();
      const movement = await db.collection('inventory_movements').findOne({
        productId: productA2Id,
        type: 'reserved',
        referenceId: orderId,
      });
      expect(movement).toBeDefined();
      expect(movement?.quantityDelta).toBe(2);
    });

    it('rejects reservation if requested quantity exceeds available stock', async () => {
      const orderId = 'ord_test_overstock';
      // productA2 available is now 3. Requesting 10 should fail.
      const items = [{ productId: productA2Id, quantity: 10 }];

      await expect(
        inventoryService.createReservations(orderId, storeAId, items)
      ).rejects.toThrow('Insufficient stock');
    });

    it('rolls back partial reservations if one item fails in a multi-item batch', async () => {
      const orderId = 'ord_test_partial_fail';
      // item 1 fits (productA1 has 50 available), item 2 exceeds (productA2 has only 3 available)
      const items = [
        { productId: productA1Id, quantity: 10 },
        { productId: productA2Id, quantity: 20 },
      ];

      await expect(
        inventoryService.createReservations(orderId, storeAId, items)
      ).rejects.toThrow('Insufficient stock');

      // Check that productA1 stock was completely rolled back!
      const projA1 = await inventoryService.getStockProjection(productA1Id);
      expect(projA1.reserved).toBe(0);
      expect(projA1.available).toBe(50);
    });

    it('commits reservation upon payment / checkout confirmation', async () => {
      const orderId = 'ord_test_001';
      await inventoryService.commitReservation(orderId);

      // Reservation status should be committed
      const db = getDb();
      const resDoc = await db.collection('inventory_reservations').findOne({ orderId });
      expect(resDoc?.status).toBe('committed');

      // Product A2 stock: onHand was 5, now 3. Reserved was 2, now 0. Available is 3.
      const proj = await inventoryService.getStockProjection(productA2Id);
      expect(proj.onHand).toBe(3);
      expect(proj.reserved).toBe(0);
      expect(proj.available).toBe(3);

      // Movement recorded as committed
      const movement = await db.collection('inventory_movements').findOne({
        productId: productA2Id,
        type: 'committed',
        referenceId: orderId,
      });
      expect(movement).toBeDefined();
      expect(movement?.quantityDelta).toBe(-2);
    });

    it('releases active reservation on checkout cancellation', async () => {
      const orderId = 'ord_test_to_cancel';
      // Reserve 1 item of Product A2 (available: 3)
      await inventoryService.createReservations(orderId, storeAId, [
        { productId: productA2Id, quantity: 1 },
      ]);

      let proj = await inventoryService.getStockProjection(productA2Id);
      expect(proj.reserved).toBe(1);
      expect(proj.available).toBe(2);

      // Release reservation
      await inventoryService.releaseReservation(orderId, 'Customer cancelled cart checkout');

      const db = getDb();
      const resDoc = await db.collection('inventory_reservations').findOne({ orderId });
      expect(resDoc?.status).toBe('released');

      // Stock returned to available
      proj = await inventoryService.getStockProjection(productA2Id);
      expect(proj.reserved).toBe(0);
      expect(proj.available).toBe(3);

      // Movement recorded as released
      const movement = await db.collection('inventory_movements').findOne({
        productId: productA2Id,
        type: 'released',
        referenceId: orderId,
      });
      expect(movement).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── CAS Worker: Expiring Stale Reservations (E12-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('Stale Reservation Expiry Worker (POST /api/v1/inventory/expire-stale-reservations)', () => {
    it('expires overdue reservations and automatically returns stock to available', async () => {
      const db = getDb();
      const staleOrderId = 'ord_stale_expired_999';

      // Create an active reservation that already expired 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      // Manually set product reserved count
      await db.collection('products').updateOne(
        { _id: productA2Id },
        {
          $inc: { reserved: 2, stockQuantity: -2 },
        }
      );

      await db.collection('inventory_reservations').insertOne({
        _id: 'res_stale_001',
        orderId: staleOrderId,
        productId: productA2Id,
        storeId: storeAId,
        quantity: 2,
        status: 'active',
        expiresAt: tenMinutesAgo,
        createdAt: fifteenMinutesAgo,
        updatedAt: fifteenMinutesAgo,
      });

      // Verify before worker: reserved is 2, available is 1
      let projBefore = await inventoryService.getStockProjection(productA2Id);
      expect(projBefore.reserved).toBe(2);
      expect(projBefore.available).toBe(1);

      // Trigger CAS worker endpoint
      const workerRes = await request(app).post('/api/v1/inventory/expire-stale-reservations');

      expect(workerRes.status).toBe(200);
      expect(workerRes.body.data.expiredCount).toBeGreaterThanOrEqual(1);

      // Verify reservation is now expired
      const staleDoc = await db.collection('inventory_reservations').findOne({ _id: 'res_stale_001' });
      expect(staleDoc?.status).toBe('expired');

      // Verify stock was restored
      const projAfter = await inventoryService.getStockProjection(productA2Id);
      expect(projAfter.reserved).toBe(0);
      expect(projAfter.available).toBe(3);

      // Verify released movement was recorded by CAS worker
      const movement = await db.collection('inventory_movements').findOne({
        productId: productA2Id,
        type: 'released',
        referenceId: staleOrderId,
      });
      expect(movement).toBeDefined();
      expect(movement?.reason).toContain('CAS worker');
    });
  });
});
