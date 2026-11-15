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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e15_reviews',
    MONGODB_DB_NAME: 'mihnati_test_e15_reviews',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('professional_profiles').deleteMany({});
  await db.collection('merchant_profiles').deleteMany({});
  await db.collection('stores').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('service_orders').deleteMany({});
  await db.collection('merchant_orders').deleteMany({});
  await db.collection('reviews').deleteMany({});
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

describe('E15 Reviews & Ratings Lifecycle', () => {
  let customerToken: string;
  let customerId: string;
  let customer2Token: string;
  let customer2Id: string;
  let proToken: string;
  let proId: string;
  let merchantToken: string;
  let merchantId: string;
  let staffToken: string;
  let staffId: string;

  let completedServiceOrderId: string;
  let activeServiceOrderId: string;
  let completedMerchantOrderId: string;
  let review1Id: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Get Cairo governorate and category
    const govs = await geographyService.listGovernorates();
    const cairoGovId = govs.find((g) => g.code === 'CAI')!._id;
    const cats = await taxonomyService.listCategories();
    const catId = cats[0].id;

    // 2. Register Customer 1
    const c1Reg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011113333',
      password: 'CustomerPass123!',
      name: 'علي حسن العميل',
    });
    customerId = c1Reg.body.data.id;
    const c1Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01011113333',
      password: 'CustomerPass123!',
    });
    customerToken = c1Login.body.data.accessToken;

    // 3. Register Customer 2 (for second review / aggregations)
    const c2Reg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011114444',
      password: 'CustomerPass123!',
      name: 'طارق مصطفى',
    });
    customer2Id = c2Reg.body.data.id;
    const c2Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01011114444',
      password: 'CustomerPass123!',
    });
    customer2Token = c2Login.body.data.accessToken;

    // 4. Register Professional
    const proReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01022225555',
      password: 'ProfessionalPass123!',
      name: 'المهندس مصطفى السباك',
    });
    proId = proReg.body.data.id;
    const proLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01022225555',
      password: 'ProfessionalPass123!',
    });
    proToken = proLogin.body.data.accessToken;

    await db.collection('professional_profiles').insertOne({
      _id: `pp_${proId}`,
      userId: proId,
      nameAr: 'المهندس مصطفى',
      nameEn: 'Eng. Mostafa',
      slug: 'eng-mostafa',
      headlineAr: 'فني سباكة وتجهيزات معتمد',
      governorateId: cairoGovId,
      verificationStatus: 'verified',
      operatingGovernorateIds: [cairoGovId],
      categories: [catId],
      rating: 0,
      reviewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Register Merchant
    const mReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01033336666',
      password: 'MerchantPass123!',
      name: 'حسام تاجر الأدوات',
    });
    merchantId = mReg.body.data.id;
    const mLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01033336666',
      password: 'MerchantPass123!',
    });
    merchantToken = mLogin.body.data.accessToken;

    await db.collection('merchant_profiles').insertOne({
      _id: `mp_${merchantId}`,
      userId: merchantId,
      businessName: 'شركة النور للأدوات الصحية',
      commercialRegister: '998877',
      governorateId: cairoGovId,
      verificationStatus: 'verified',
      operatingGovernorateIds: [cairoGovId],
      categories: [catId],
      rating: 0,
      reviewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Register Staff (Support / Admin)
    const sReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01077778888',
      password: 'StaffAdminPass123!',
      name: 'مشرف جودة التقييمات',
    });
    staffId = sReg.body.data.id;
    const sLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01077778888',
      password: 'StaffAdminPass123!',
    });
    staffToken = sLogin.body.data.accessToken;

    await db.collection('user_role_assignments').insertOne({
      _id: `ura_${staffId}_support`,
      userId: staffId,
      roleKey: 'support',
      status: 'active',
      assignedAt: new Date(),
    });

    // 7. Seed completed ServiceOrder
    completedServiceOrderId = 'srv_ord_comp_001';
    await db.collection('service_orders').insertOne({
      _id: completedServiceOrderId,
      orderNumber: 'SO-2026-0001',
      serviceRequestId: 'req_001',
      offerId: 'off_001',
      customerId,
      professionalUserId: proId,
      status: 'completed',
      agreedPricePiastres: 50000,
      termsSnapshot: { title: 'صيانة خط مياه وتغيير محابس' },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed active (in_progress) ServiceOrder for rejection test
    activeServiceOrderId = 'srv_ord_active_002';
    await db.collection('service_orders').insertOne({
      _id: activeServiceOrderId,
      orderNumber: 'SO-2026-0002',
      serviceRequestId: 'req_002',
      offerId: 'off_002',
      customerId,
      professionalUserId: proId,
      status: 'in_progress',
      agreedPricePiastres: 35000,
      termsSnapshot: { title: 'أعمال تأسيس سباكة قيد التنفيذ' },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 8. Seed completed MerchantOrder
    completedMerchantOrderId = 'mch_ord_comp_001';
    await db.collection('merchant_orders').insertOne({
      _id: completedMerchantOrderId,
      orderNumber: 'ORD-2026-9901',
      storeId: 'store_001',
      merchantUserId: merchantId,
      customerId,
      status: 'completed',
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'closed',
      codExpectedPiastres: 45000,
      items: [
        {
          productId: 'prod_001',
          titleAr: 'طقم خلاط مياه إيطالي',
          titleEn: 'Italian Faucet Set',
          sku: 'FAUCET-IT-01',
          unitPricePiastres: 40000,
          quantity: 1,
          totalPiastres: 40000,
        },
      ],
      subtotalPiastres: 40000,
      deliveryFeePiastres: 5000,
      totalPiastres: 45000,
      deliveryAddressSnapshot: {
        addressId: 'addr_001',
        label: 'المنزل',
        governorateId: cairoGovId,
        addressText: '10 شارع التحرير',
        phone: '01011113333',
      },
      addressConsentGranted: true,
      addressConsentGrantedAt: new Date(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Service Order Reviews (E15-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Service Order Review Creation', () => {
    it('customer creates verified review for completed service order and updates rating', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${completedServiceOrderId}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 5,
          comment: 'خدمة احترافية جداً ومواعيد ممتازة وخبرة عالية في كشف التسريبات',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.rating).toBe(5);
      expect(res.body.data.revieweeId).toBe(proId);
      expect(res.body.data.status).toBe('visible');
      expect(res.body.data.reviewerName).toBeDefined();
      review1Id = res.body.data.id;

      // Verify profile rating and reviewCount were updated
      const db = getDb();
      const profile = await db.collection('professional_profiles').findOne({ userId: proId });
      expect(profile?.rating).toBe(5);
      expect(profile?.reviewCount).toBe(1);

      // Verify audit log
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: completedServiceOrderId,
        action: 'review:created',
      });
      expect(log).toBeDefined();
    });

    it('rejects duplicate review on same completed service order (409 DUPLICATE_REVIEW)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${completedServiceOrderId}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 4,
          comment: 'محاولة كتابة تقييم ثانٍ لنفس الطلب',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_REVIEW');
    });

    it('rejects reviewing service order that is not completed (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${activeServiceOrderId}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 5,
          comment: 'محاولة تقييم طلب لم يكتمل بعد',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('only permitted after order completion');
    });

    it('rejects review with invalid rating score outside 1-5 (400 ValidationError)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${completedServiceOrderId}/reviews`)
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          rating: 6, // Invalid > 5
          comment: 'تقييم برقم خارج النطاق',
        });

      expect(res.status).toBe(400);
    });

    it('rejects review by non-customer participant (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${completedServiceOrderId}/reviews`)
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          rating: 5,
          comment: 'محاولة تقييم طلب لعميل آخر',
        });

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Merchant Order Reviews (E15-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Merchant Order Review Creation', () => {
    it('customer creates verified review for completed merchant order', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${completedMerchantOrderId}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 4,
          comment: 'المنتج أصلي وممتاز والتغليف محكم والتوصيل في الموعد المحدد',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.rating).toBe(4);
      expect(res.body.data.revieweeId).toBe(merchantId);
      expect(res.body.data.status).toBe('visible');

      // Verify merchant profile updated
      const db = getDb();
      const profile = await db.collection('merchant_profiles').findOne({ userId: merchantId });
      expect(profile?.rating).toBe(4);
      expect(profile?.reviewCount).toBe(1);
    });

    it('rejects duplicate review on same merchant order (409 DUPLICATE_REVIEW)', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant-orders/${completedMerchantOrderId}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 5,
          comment: 'محاولة تقييم إضافي',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_REVIEW');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Reviewee Response (Reply Once) ──
  // ══════════════════════════════════════════════════════════════

  describe('Professional / Merchant Response to Review', () => {
    it('professional responds to review addressed to them', async () => {
      const res = await request(app)
        .post(`/api/v1/reviews/${review1Id}/response`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          comment: 'شكراً جزيلاً لك أستاذ علي، وسعدت بالتعامل معك وفي خدمتك دائماً',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.response).toBeDefined();
      expect(res.body.data.response.comment).toContain('شكراً جزيلاً لك');
      expect(res.body.data.response.respondedAt).toBeDefined();

      // Verify audit log
      const db = getDb();
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: review1Id,
        action: 'review:responded',
      });
      expect(log).toBeDefined();
    });

    it('rejects duplicate response from reviewee (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/reviews/${review1Id}/response`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          comment: 'رد ثانٍ على نفس التقييم',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('already responded');
    });

    it('rejects response by non-reviewee user (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/reviews/${review1Id}/response`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          comment: 'محاولة تاجر الرد على تقييم مهني آخر',
        });

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Public Review Listing & Score Summary ──
  // ══════════════════════════════════════════════════════════════

  describe('Public Reviews & Aggregate Score Summary', () => {
    beforeAll(async () => {
      // Create a second completed order for Customer 2 with the same Professional
      const db = getDb();
      const srvOrd2 = 'srv_ord_comp_002';
      await db.collection('service_orders').insertOne({
        _id: srvOrd2,
        orderNumber: 'SO-2026-0003',
        serviceRequestId: 'req_003',
        offerId: 'off_003',
        customerId: customer2Id,
        professionalUserId: proId,
        status: 'completed',
        agreedPricePiastres: 60000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Customer 2 reviews Professional with 3 stars
      await request(app)
        .post(`/api/v1/service-orders/${srvOrd2}/reviews`)
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          rating: 3,
          comment: 'العمل جيد ولكن كان هناك تأخير بسيط في الحضور',
        });
    });

    it('returns target reviews list and computed summary (average & distribution)', async () => {
      const res = await request(app)
        .get(`/api/v1/reviews?targetId=${proId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);

      // Verify summary: one 5-star, one 3-star => average = (5+3)/2 = 4.0
      expect(res.body.summary).toMatchObject({
        averageRating: 4,
        totalReviews: 2,
        distribution: {
          1: 0,
          2: 0,
          3: 1,
          4: 0,
          5: 1,
        },
      });

      // Check profile in DB
      const db = getDb();
      const profile = await db.collection('professional_profiles').findOne({ userId: proId });
      expect(profile?.rating).toBe(4);
      expect(profile?.reviewCount).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 5. Admin Moderation & Exclusion from Aggregates ──
  // ══════════════════════════════════════════════════════════════

  describe('Admin Review Moderation & Aggregate Score Reconciliation', () => {
    it('support staff lists reviews for moderation queue', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects non-staff user accessing moderation queue (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('admin hides review and verifies hidden review is excluded from aggregate rating', async () => {
      // Hide review1 (the 5-star review)
      const res = await request(app)
        .post(`/api/v1/admin/reviews/${review1Id}/moderate`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          action: 'hide',
          reason: 'مراجعة أمنية لبلاغ لفظي غير لائق',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('hidden_pending_review');

      // Crucial requirement: hidden reviews must be excluded from aggregates!
      // Previously had [5, 3] => average 4.0. With 5 hidden, only [3] remains => average 3.0, total 1.
      const publicQuery = await request(app).get(`/api/v1/reviews?targetId=${proId}`);
      expect(publicQuery.status).toBe(200);
      expect(publicQuery.body.data.length).toBe(1);
      expect(publicQuery.body.summary.averageRating).toBe(3);
      expect(publicQuery.body.summary.totalReviews).toBe(1);

      // Verify profile in DB reflects exclusion
      const db = getDb();
      const profile = await db.collection('professional_profiles').findOne({ userId: proId });
      expect(profile?.rating).toBe(3);
      expect(profile?.reviewCount).toBe(1);
    });

    it('admin restores review and verifies aggregates are recalculated', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/reviews/${review1Id}/moderate`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          action: 'restore',
          reason: 'تم التحقق من سلامة المراجعة وخلوها من المخالفات',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('visible');

      // Re-query public summary: both [5, 3] visible => average 4.0, total 2
      const publicQuery = await request(app).get(`/api/v1/reviews?targetId=${proId}`);
      expect(publicQuery.body.summary.averageRating).toBe(4);
      expect(publicQuery.body.summary.totalReviews).toBe(2);

      const db = getDb();
      const profile = await db.collection('professional_profiles').findOne({ userId: proId });
      expect(profile?.rating).toBe(4);
      expect(profile?.reviewCount).toBe(2);
    });

    it('admin removes violating review', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/reviews/${review1Id}/moderate`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          action: 'remove',
          reason: 'حذف نهائي بناءً على حكم نزاع معتمد',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('removed');

      // Audit log check
      const db = getDb();
      const log = await db.collection('admin_audit_logs').findOne({
        targetId: review1Id,
        action: 'review:moderated',
      });
      expect(log).toBeDefined();
    });
  });
});

