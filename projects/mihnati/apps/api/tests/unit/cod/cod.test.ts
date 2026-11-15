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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e14_cod',
    MONGODB_DB_NAME: 'mihnati_test_e14_cod',
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
  await db.collection('cod_reports').deleteMany({});
  await db.collection('cod_disputes').deleteMany({});
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

describe('E14 COD Operations (Cash On Delivery)', () => {
  let customerToken: string;
  let customerId: string;
  let merchantAToken: string;
  let merchantAId: string;
  let merchantBToken: string;
  let staffToken: string;
  let staffId: string;

  let storeAId: string;
  let productA1Id: string;
  let deliveryAddressId: string;
  let orderCollectedId: string;
  let orderFailedId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Get Cairo governorate and product category
    const govs = await geographyService.listGovernorates();
    const cairoGovId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'product' });
    const productCatId = cats[0].id;

    // 2. Register Customer
    const custReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01055551111',
      password: 'CustomerPass123!',
      name: 'محمود عبد السلام',
    });
    customerId = custReg.body.data.id;

    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01055551111',
      password: 'CustomerPass123!',
    });
    customerToken = custLogin.body.data.accessToken;

    // Add delivery address
    const addrRes = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        label: 'المنزل - الدقي',
        governorateId: cairoGovId,
        addressText: '10 شارع مصدق، الدقي، الجيزة',
        building: 'برج الأطباء',
        floor: 'الدور السادس',
        phone: '01055551111',
      });
    deliveryAddressId = addrRes.body.data.id;

    // 3. Register Merchant A
    const mAReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01055552222',
      password: 'MerchantPass123!',
      name: 'تاجر التجهيزات المنزلية',
    });
    merchantAId = mAReg.body.data.id;

    const mALogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01055552222',
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
        nameAr: 'متجر التجهيزات المنزلية الحديثة',
        nameEn: 'Modern Home Supplies',
        slug: 'modern-home-supplies',
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
        titleAr: 'ماكينة قهوة إسبريسو منزلية 15 بار',
        titleEn: 'Home Espresso Coffee Maker 15 Bar',
        slug: 'espresso-maker-15bar',
        categoryId: productCatId,
        sku: 'COFFEE-ESP-001',
        price: 95000, // 950.00 EGP
        stockQuantity: 20,
      });
    productA1Id = pA1Res.body.data.id;
    await db.collection('products').updateOne({ _id: productA1Id }, { $set: { status: 'active', onHand: 20 } });

    // 4. Register Merchant B (for IDOR tests)
    await request(app).post('/api/v1/auth/register').send({
      phone: '01055553333',
      password: 'MerchantBPass123!',
      name: 'تاجر منافس آخر',
    });
    const mBLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01055553333',
      password: 'MerchantBPass123!',
    });
    merchantBToken = mBLogin.body.data.accessToken;

    // 5. Register Staff Reviewer (admin/support)
    const staffReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01055559999',
      password: 'StaffAdminPass123!',
      name: 'مسؤول الدعم وفض النزاعات',
    });
    staffId = staffReg.body.data.id;

    const staffLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01055559999',
      password: 'StaffAdminPass123!',
    });
    staffToken = staffLogin.body.data.accessToken;

    // Assign support role to staff
    await db.collection('user_role_assignments').insertOne({
      _id: `ura_${staffId}_support`,
      userId: staffId,
      roleKey: 'support',
      status: 'active',
      assignedAt: new Date(),
    });

    // 6. Create Order 1 (for successful collection & dispute)
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: productA1Id,
        quantity: 1,
      });

    const chk1 = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'checkout-cod-test-001')
      .send({
        deliveryAddressId,
        consentToShareDeliveryAddress: true,
        paymentMethod: 'cash_on_delivery',
      });
    orderCollectedId = chk1.body.data.id;

    // Advance Order 1 to delivered
    await request(app).post(`/api/v1/merchant/orders/${orderCollectedId}/confirm`).set('Authorization', `Bearer ${merchantAToken}`);
    await request(app).post(`/api/v1/merchant/orders/${orderCollectedId}/prepare`).set('Authorization', `Bearer ${merchantAToken}`);
    await request(app).post(`/api/v1/merchant/orders/${orderCollectedId}/ready`).set('Authorization', `Bearer ${merchantAToken}`);
    await request(app).post(`/api/v1/merchant/orders/${orderCollectedId}/dispatch`).set('Authorization', `Bearer ${merchantAToken}`).send({ courierName: 'ساعي مصر' });
    await request(app).post(`/api/v1/merchant/orders/${orderCollectedId}/mark-delivered`).set('Authorization', `Bearer ${merchantAToken}`).send({ proofNotes: 'تم التسليم باليد' });

    // 7. Create Order 2 (for failed collection)
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: productA1Id,
        quantity: 1,
      });

    const chk2 = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'checkout-cod-test-002')
      .send({
        deliveryAddressId,
        consentToShareDeliveryAddress: true,
        paymentMethod: 'cash_on_delivery',
      });
    orderFailedId = chk2.body.data.id;
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Merchant Cash Collection Reporting (E14-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Merchant COD Reporting (POST /api/v1/merchant/orders/:id/cod-reports)', () => {
    it('merchant submits successful cash collection report with proof', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderCollectedId}/cod-reports`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          status: 'collected',
          amountCollectedPiastres: 100000, // 95000 + 5000 delivery = 1000.00 EGP
          proofRefs: ['receipt_cod_9988.jpg'],
          notes: 'استلم المندوب المبلغ بالكامل نقدياً مع الإيصال',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('collected');
      expect(res.body.data.amountCollectedPiastres).toBe(100000);
      expect(res.body.data.isAssertion).toBe(true);
      expect(res.body.data.disclaimer).toContain('merchant assertion');

      // Verify order payment status updated
      const db = getDb();
      const order = await db.collection('merchant_orders').findOne({ _id: orderCollectedId });
      expect(order?.paymentStatus).toBe('merchant_reported_collected');

      // Verify audit log
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: orderCollectedId,
        action: 'cod:report_submitted',
      });
      expect(log).toBeDefined();
    });

    it('merchant submits failed collection report with detailed reason', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderFailedId}/cod-reports`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          status: 'not_collected',
          reason: 'تعذر التواصل مع العميل ورفض الاستلام لعدم توفر المبلغ نقدياً',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('not_collected');
      expect(res.body.data.amountCollectedPiastres).toBe(0);
      expect(res.body.data.reason).toBe('تعذر التواصل مع العميل ورفض الاستلام لعدم توفر المبلغ نقدياً');

      const db = getDb();
      const order = await db.collection('merchant_orders').findOne({ _id: orderFailedId });
      expect(order?.paymentStatus).toBe('merchant_reported_not_collected');
    });

    it('rejects failure report without required reason (400 ValidationError)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderFailedId}/cod-reports`)
        .set('Authorization', `Bearer ${merchantAToken}`)
        .send({
          status: 'not_collected',
          // reason missing
        });

      expect(res.status).toBe(400);
    });

    it('prevents IDOR: unauthorized merchant cannot submit report for another merchant order', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/orders/${orderCollectedId}/cod-reports`)
        .set('Authorization', `Bearer ${merchantBToken}`)
        .send({
          status: 'collected',
          amountCollectedPiastres: 100000,
        });

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Report Retrieval ──
  // ══════════════════════════════════════════════════════════════

  describe('Report Retrieval (GET /merchant/orders/:id/cod-reports & /merchant-orders/:id/cod-reports)', () => {
    it('merchant can list reports for their order', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/orders/${orderCollectedId}/cod-reports`)
        .set('Authorization', `Bearer ${merchantAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].status).toBe('collected');
    });

    it('customer can view COD reports for their order', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant-orders/${orderCollectedId}/cod-reports`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].status).toBe('collected');
    });

    it('rejects unauthorized user viewing reports (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/orders/${orderCollectedId}/cod-reports`)
        .set('Authorization', `Bearer ${merchantBToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Customer COD Dispute (E14-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('Customer COD Dispute (POST /api/v1/merchant-orders/:id/cod-disputes)', () => {
    let createdDisputeId: string;

    it('customer opens COD discrepancy dispute with reason and claimed amount', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${orderCollectedId}/cod-disputes`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          disputeReason: 'المندوب طالب بمبلغ إضافي قدره 100 جنيه دون وجه حق ولم يرجع باقي الألف جنيه',
          customerClaimedAmountPiastres: 110000,
          evidenceMediaRefs: ['chat_screenshot_with_courier.png'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('open');
      expect(res.body.data.disputeReason).toContain('المندوب طالب بمبلغ إضافي');
      createdDisputeId = res.body.data.id;

      // Verify order paymentStatus updated to discrepancy_reported
      const db = getDb();
      const order = await db.collection('merchant_orders').findOne({ _id: orderCollectedId });
      expect(order?.paymentStatus).toBe('discrepancy_reported');

      // Verify audit log
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: orderCollectedId,
        action: 'cod:dispute_opened',
      });
      expect(log).toBeDefined();
    });

    it('rejects opening duplicate dispute for order with active dispute (409 DUPLICATE_DISPUTE)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${orderCollectedId}/cod-disputes`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          disputeReason: 'محاولة فتح نزاع ثانٍ لنفس الطلب',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_DISPUTE');
    });

    it('customer and merchant can list disputes for the order', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant-orders/${orderCollectedId}/cod-disputes`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((d: any) => d.id === createdDisputeId)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Staff Dispute Review & Resolution (E14-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('Staff COD Dispute Operations (Admin / Support)', () => {
    let disputeToReviewId: string;

    beforeAll(async () => {
      const db = getDb();
      const disp = await db.collection('cod_disputes').findOne({ orderId: orderCollectedId });
      disputeToReviewId = disp!._id;
    });

    it('support staff can list all COD disputes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/cod-disputes')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects non-staff user accessing admin disputes (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/cod-disputes')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('staff assigns dispute to self (open -> under_review)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/cod-disputes/${disputeToReviewId}/assign`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('under_review');
      expect(res.body.data.assignedStaffId).toBe(staffId);

      // Verify order paymentStatus updated to under_review
      const db = getDb();
      const order = await db.collection('merchant_orders').findOne({ _id: orderCollectedId });
      expect(order?.paymentStatus).toBe('under_review');

      // Verify audit log
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: disputeToReviewId,
        action: 'cod:dispute_assigned',
      });
      expect(log).toBeDefined();
    });

    it('staff resolves dispute with reasoned decision (under_review -> resolved)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/cod-disputes/${disputeToReviewId}/resolve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          resolutionOutcome: 'upheld_customer',
          resolutionNotes: 'تم التحقيق والتأكد من خطأ المندوب، وقام التاجر برد المبلغ الزائد نقداً للعميل',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolutionOutcome).toBe('upheld_customer');
      expect(res.body.data.resolvedAt).toBeDefined();

      // Verify order paymentStatus updated to closed
      const db = getDb();
      const order = await db.collection('merchant_orders').findOne({ _id: orderCollectedId });
      expect(order?.paymentStatus).toBe('closed');

      // Verify audit log
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: disputeToReviewId,
        action: 'cod:dispute_resolved',
      });
      expect(log).toBeDefined();
    });

    it('rejects resolving an already resolved dispute (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/cod-disputes/${disputeToReviewId}/resolve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          resolutionOutcome: 'no_collection_due',
          resolutionNotes: 'محاولة حل ثانٍ لنفس النزاع',
        });

      expect(res.status).toBe(409);
    });
  });
});

