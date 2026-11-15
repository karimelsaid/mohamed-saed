import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { geographyService } from '../../../src/modules/geography/geography.service.js';
import { taxonomyService } from '../../../src/modules/taxonomy/taxonomy.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e13_merchant_orders',
    MONGODB_DB_NAME: 'mihnati_test_e13_merchant_orders',
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
  await db.collection('carts').deleteMany({});
  await db.collection('customer_addresses').deleteMany({});
  await db.collection('merchant_orders').deleteMany({});
  await db.collection('idempotency_claims').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});
  await db.collection('governorates').deleteMany({});
  await db.collection('localities').deleteMany({});
  await db.collection('categories').deleteMany({});

  await geographyService.seedIfEmpty();
  await taxonomyService.seedIfEmpty();

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E13 Merchant Orders & Delivery Lifecycle', () => {
  let customerToken: string;
  let customerId: string;
  let merchantAToken: string;
  let merchantAId: string;
  let merchantBToken: string;

  let storeAId: string;
  let productA1Id: string;
  let deliveryAddressId: string;
  let primaryOrderId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Get Cairo governorate and product category
    const govs = await geographyService.listGovernorates();
    const cairoGovId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'product' });
    const productCatId = cats[0].id;

    // 2. Register Customer
    const custReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01012345678',
      password: 'CustomerPass123!',
      name: 'أحمد محمود العميل',
    });
    customerId = custReg.body.data.id;

    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01012345678',
      password: 'CustomerPass123!',
    });
    customerToken = custLogin.body.data.accessToken;

    // Add delivery address for customer
    const addrRes = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        label: 'المنزل - المعادي',
        governorateId: cairoGovId,
        addressText: '25 شارع النصر، المعادي الجديدة، القاهرة',
        building: 'عمارة 14',
        floor: 'الدور الرابع',
        apartment: 'شقة 402',
        phone: '01012345678',
      });
    deliveryAddressId = addrRes.body.data.id;

    // 3. Register Merchant A
    const mAReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01099991111',
      password: 'MerchantPass123!',
      name: 'تاجر الأجهزة الكهربائية',
    });
    merchantAId = mAReg.body.data.id;

    const mALogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01099991111',
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
        nameAr: 'متجر مصر للإلكترونيات',
        nameEn: 'Misr Electronics Store',
        slug: 'misr-electronics-store',
        governorateId: cairoGovId,
        categories: [productCatId],
      });
    storeAId = storeRes.body.data.id;
    await db.collection('stores').updateOne({ _id: storeAId }, { $set: { status: 'active' } });

    // Create active Product A1
    const pA1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        titleAr: 'سماعة رأس لاسلكية احترافية عازلة للضوضاء',
        titleEn: 'Pro Wireless ANC Headphones',
        slug: 'pro-anc-headphones',
        categoryId: productCatId,
        sku: 'HEADSET-ANC-001',
        price: 85000, // 850.00 EGP
        stockQuantity: 15,
      });
    productA1Id = pA1Res.body.data.id;
    await db.collection('products').updateOne({ _id: productA1Id }, { $set: { status: 'active', onHand: 15 } });

    // 4. Register Merchant B (for IDOR checks)
    await request(app).post('/api/v1/auth/register').send({
      phone: '01088882222',
      password: 'MerchantBPass123!',
      name: 'تاجر منافس ب',
    });
    const mBLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088882222',
      password: 'MerchantBPass123!',
    });
    merchantBToken = mBLogin.body.data.accessToken;

    // 5. Customer places an order via E11 Cart & Checkout
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: productA1Id,
        quantity: 2,
      });

    const checkoutRes = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'checkout-key-order-lifecycle-001')
      .send({
        deliveryAddressId,
        consentToShareDeliveryAddress: true,
        paymentMethod: 'cash_on_delivery',
        notes: 'الرجاء الاتصال قبل التوصيل',
      });

    primaryOrderId = checkoutRes.body.data.id;
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Order Queries & IDOR Prevention (E13-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Order Retrieval & IDOR Access Controls', () => {
    it('customer can list their own orders', async () => {
      const res = await request(app)
        .get('/api/v1/merchant-orders/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].id).toBe(primaryOrderId);
      expect(res.body.data[0].status).toBe('created');
    });

    it('customer can get details of their own order', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant-orders/${primaryOrderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(primaryOrderId);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].quantity).toBe(2);
    });

    it('merchant can list orders for their store', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/orders')
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((o: any) => o.id === primaryOrderId)).toBe(true);
    });

    it('merchant can get order details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/orders/${primaryOrderId}`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(primaryOrderId);
      expect(res.body.data.customerId).toBe(customerId);
    });

    it('prevents IDOR: unauthorized merchant cannot access another merchant order', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/orders/${primaryOrderId}`)
        .set('Authorization', `Bearer ${merchantBToken}`);

      expect(res.status).toBe(403);
    });

    it('prevents IDOR: unauthorized user cannot access another customer order', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant-orders/${primaryOrderId}`)
        .set('Authorization', `Bearer ${merchantBToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for nonexistent order', async () => {
      const res = await request(app)
        .get('/api/v1/merchant-orders/non-existent-order-id')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Audited & Non-cacheable Delivery Address Reveal ──
  // ══════════════════════════════════════════════════════════════

  describe('Audited Delivery Address Reveal (GET /api/v1/merchant/orders/:id/delivery-address)', () => {
    it('reveals delivery address snapshot to merchant with no-store headers and writes audit log', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/orders/${primaryOrderId}/delivery-address`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.body.data.addressText).toContain('المعادي');
      expect(res.body.data.building).toBe('عمارة 14');
      expect(res.body.data.phone).toBe('01012345678');

      // Verify audit log
      const db = getDb();
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: primaryOrderId,
        action: 'merchant_order:address_revealed',
      });
      expect(log).toBeDefined();
      expect(log?.actorId).toBe(merchantAId);
    });

    it('rejects unauthorized merchant trying to reveal address (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/orders/${primaryOrderId}/delivery-address`)
        .set('Authorization', `Bearer ${merchantBToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Merchant Order Confirmation & State Machine ──
  // ══════════════════════════════════════════════════════════════

  describe('Merchant Order State Machine (E13-T01)', () => {
    it('merchant confirms order (created -> confirmed)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/confirm`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
      expect(res.body.data.version).toBe(2);

      // Verify audit log
      const db = getDb();
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: primaryOrderId,
        action: 'merchant_order:confirm',
      });
      expect(log).toBeDefined();
    });

    it('rejects confirming an already confirmed order (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/confirm`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('Only pending orders');
    });

    it('merchant starts preparation (confirmed -> preparing)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/prepare`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('preparing');
    });

    it('merchant marks order packed and ready (preparing -> ready_for_delivery)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/ready`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ready_for_delivery');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Dispatch Proof & Completion (E13-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('Dispatch Proof, Delivery & Customer Completion (E13-T02)', () => {
    it('merchant dispatches order with courier details (ready_for_delivery -> out_for_delivery)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/dispatch`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          courierName: 'بوسطة مصر للشحن السريع',
          trackingNumber: 'BOS-CAI-2026-9901',
          dispatchNotes: 'تم تسليم الشحنة لمندوب التوزيع',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('out_for_delivery');
      expect(res.body.data.dispatchInfo).toMatchObject({
        courierName: 'بوسطة مصر للشحن السريع',
        trackingNumber: 'BOS-CAI-2026-9901',
        dispatchNotes: 'تم تسليم الشحنة لمندوب التوزيع',
      });
      expect(res.body.data.dispatchInfo.dispatchedAt).toBeDefined();
    });

    it('rejects marking delivered without required proof notes (400 ValidationError)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/mark-delivered`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          proofNotes: '', // Missing / empty
        });

      expect(res.status).toBe(400);
    });

    it('merchant marks delivered with valid proof notes and media reference', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${primaryOrderId}/mark-delivered`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          proofNotes: 'تم تسليم الشحنة للعميل بمقر السكن واستلام 1750 جنيه نقداً',
          proofMediaRef: 'media_signed_receipt_9901.pdf',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('delivered');
      expect(res.body.data.deliveryProof).toMatchObject({
        proofNotes: 'تم تسليم الشحنة للعميل بمقر السكن واستلام 1750 جنيه نقداً',
        proofMediaRef: 'media_signed_receipt_9901.pdf',
      });
      expect(res.body.data.deliveryProof.deliveredAt).toBeDefined();
    });

    it('customer confirms delivery receipt (delivered -> completed)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${primaryOrderId}/confirm-delivery`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');

      // Verify audit log
      const db = getDb();
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: primaryOrderId,
        action: 'merchant_order:confirm_delivery',
      });
      expect(log).toBeDefined();
    });

    it('rejects customer confirming an already completed order (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${primaryOrderId}/confirm-delivery`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(409);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 5. Merchant Rejection & Stock Restoration ──
  // ══════════════════════════════════════════════════════════════

  describe('Merchant Order Rejection & Stock Restoration', () => {
    let orderToRejectId: string;

    beforeAll(async () => {
      // Customer places a second order
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productA1Id,
          quantity: 1,
        });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'checkout-key-reject-test-001')
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
        });

      orderToRejectId = checkoutRes.body.data.id;
    });

    it('rejects order with valid reason and restores product stock', async () => {
      const db = getDb();
      const prodBefore = await db.collection('products').findOne({ _id: productA1Id });
      const stockBefore = prodBefore?.stockQuantity ?? 0;

      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderToRejectId}/reject`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          reason: 'تعذر توفير المنتج لانتهاء الكمية بالمستودع',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectionInfo.reason).toBe('تعذر توفير المنتج لانتهاء الكمية بالمستودع');
      expect(res.body.data.rejectionInfo.rejectedAt).toBeDefined();

      // Check stock restored (+1)
      const prodAfter = await db.collection('products').findOne({ _id: productA1Id });
      expect(prodAfter?.stockQuantity).toBe(stockBefore + 1);
    });

    it('rejects rejecting order without adequate reason (< 3 chars)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderToRejectId}/reject`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          reason: 'no',
        });

      expect(res.status).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 6. Pre-dispatch Cancellation vs Post-dispatch Cutoff ──
  // ══════════════════════════════════════════════════════════════

  describe('Cancellation Rules: Pre-dispatch Allowed vs Post-dispatch Rejected', () => {
    let orderToCancelId: string;
    let orderDispatchedId: string;

    beforeAll(async () => {
      // 1. Order for pre-dispatch cancellation
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productA1Id,
          quantity: 1,
        });

      const res1 = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'checkout-key-cancel-predispatch')
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
        });
      orderToCancelId = res1.body.data.id;

      // 2. Order to advance to dispatched state
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: productA1Id,
          quantity: 1,
        });

      const res2 = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'checkout-key-cancel-postdispatch')
        .send({
          deliveryAddressId,
          consentToShareDeliveryAddress: true,
          paymentMethod: 'cash_on_delivery',
        });
      orderDispatchedId = res2.body.data.id;

      // Advance order 2 to out_for_delivery
      await request(app).post(`/api/v1/merchant/orders/${orderDispatchedId}/confirm`).set('Authorization', `Bearer ${merchantAToken}`);
      await request(app).post(`/api/v1/merchant/orders/${orderDispatchedId}/prepare`).set('Authorization', `Bearer ${merchantAToken}`);
      await request(app).post(`/api/v1/merchant/orders/${orderDispatchedId}/ready`).set('Authorization', `Bearer ${merchantAToken}`);
      await request(app).post(`/api/v1/merchant/orders/${orderDispatchedId}/dispatch`).set('Authorization', `Bearer ${merchantAToken}`).send({
        courierName: 'أرامكس مصر',
      });
    });

    it('customer can cancel order in pre-dispatch state and stock is restored', async () => {
      const db = getDb();
      const prodBefore = await db.collection('products').findOne({ _id: productA1Id });
      const stockBefore = prodBefore?.stockQuantity ?? 0;

      const res = await request(app)
        .post(`/api/v1/merchant-orders/${orderToCancelId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reason: 'تم الشراء من متجر محلي قريب ولَم أعد بحاجة للطلب',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.cancellationInfo.cancelledBy).toBe('customer');

      // Check stock restored
      const prodAfter = await db.collection('products').findOne({ _id: productA1Id });
      expect(prodAfter?.stockQuantity).toBe(stockBefore + 1);
    });

    it('rejects cancellation after dispatch (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${orderDispatchedId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reason: 'محاولة إلغاء بعد خروج الشحنة للتوصيل',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('after dispatch');
    });

    it('rejects merchant cancellation after dispatch (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderDispatchedId}/cancel`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          reason: 'محاولة تاجر إلغاء بعد خروج الشحنة',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('after dispatch');
    });
  });
});

