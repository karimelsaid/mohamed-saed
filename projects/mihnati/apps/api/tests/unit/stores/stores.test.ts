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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e10_stores',
    MONGODB_DB_NAME: 'mihnati_test_e10_stores',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('merchant_profiles').deleteMany({});
  await db.collection('verification_cases').deleteMany({});
  await db.collection('stores').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});
  await db.collection('governorates').deleteMany({});
  await db.collection('localities').deleteMany({});
  await db.collection('categories').deleteMany({});
  await db.collection('specialties').deleteMany({});

  await geographyService.seedIfEmpty();
  await taxonomyService.seedIfEmpty();

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E10 Merchant Stores & Products (MVP)', () => {
  let adminToken: string;
  let verifiedMerchantToken: string;
  let unverifiedMerchantToken: string;
  let otherMerchantToken: string;
  let customerToken: string;

  let cairoGovId: string;
  let productCatId: string;
  let serviceCatId: string;

  let createdStoreId: string;
  let createdProductId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Create Admin
    const adminReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880001',
      password: 'AdminPassword123!',
      name: 'مشرف المتاجر والمنتجات',
    });
    await db.collection('user_role_assignments').insertOne({
      _id: 'test-admin-stores-mod',
      userId: adminReg.body.data.id,
      roleKey: 'admin',
      status: 'active',
      grantedAt: new Date(),
    });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880001',
      password: 'AdminPassword123!',
    });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Create Unverified Merchant
    const unverifiedReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880002',
      password: 'MerchantPass123!',
      name: 'تاجر قيد الانتظار',
    });
    const unverifiedLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880002',
      password: 'MerchantPass123!',
    });
    unverifiedMerchantToken = unverifiedLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/merchant/activate')
      .set('Authorization', `Bearer ${unverifiedMerchantToken}`);

    // 3. Create Verified Merchant
    const verifiedReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880003',
      password: 'MerchantPass123!',
      name: 'تاجر موثق معتمد',
    });
    const verifiedLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880003',
      password: 'MerchantPass123!',
    });
    verifiedMerchantToken = verifiedLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/merchant/activate')
      .set('Authorization', `Bearer ${verifiedMerchantToken}`);

    // Mark merchant as verified
    await db.collection('merchant_profiles').updateOne(
      { userId: verifiedReg.body.data.id },
      { $set: { verificationStatus: 'verified', businessName: 'مؤسسة النور للأدوات' } }
    );

    // 4. Create Another Verified Merchant (for IDOR tests)
    const otherReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880004',
      password: 'MerchantPass123!',
      name: 'تاجر منافس',
    });
    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880004',
      password: 'MerchantPass123!',
    });
    otherMerchantToken = otherLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/merchant/activate')
      .set('Authorization', `Bearer ${otherMerchantToken}`);
    await db.collection('merchant_profiles').updateOne(
      { userId: otherReg.body.data.id },
      { $set: { verificationStatus: 'verified', businessName: 'شركة الأمل' } }
    );

    // 5. Create Customer
    const custReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880005',
      password: 'CustomerPass123!',
      name: 'عميل المنصة',
    });
    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880005',
      password: 'CustomerPass123!',
    });
    customerToken = custLogin.body.data.accessToken;

    // Fetch Cairo governorate
    const govs = await geographyService.listGovernorates();
    cairoGovId = govs.find((g) => g.code === 'CAI')!._id;

    // Fetch product category and service category
    const productCats = await taxonomyService.listCategories({ type: 'product' });
    productCatId = productCats[0].id;

    const serviceCats = await taxonomyService.listCategories({ type: 'service' });
    serviceCatId = serviceCats[0].id;
  });

  // ══════════════════════════════════════════════════════════════
  // ── E10-T01: Merchant Profile & Store Creation ──
  // ══════════════════════════════════════════════════════════════

  describe('E10-T01: Store Creation & One-Store Constraint', () => {
    it('should reject store creation if user has no merchant profile', async () => {
      const res = await request(app)
        .post('/api/v1/stores/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          nameAr: 'متجر العميل',
          nameEn: 'Customer Store',
          slug: 'customer-store',
          governorateId: cairoGovId,
          categories: [productCatId],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject store creation with invalid service category instead of product category', async () => {
      const res = await request(app)
        .post('/api/v1/stores/me')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          nameAr: 'متجر النور',
          nameEn: 'Al-Noor Store',
          slug: 'al-noor-tools',
          governorateId: cairoGovId,
          categories: [serviceCatId], // invalid category type
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create a store draft for merchant', async () => {
      const res = await request(app)
        .post('/api/v1/stores/me')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          nameAr: 'متجر النور للأدوات',
          nameEn: 'Al-Noor Tools Store',
          slug: 'al-noor-tools',
          descriptionAr: 'جميع الأدوات والمعدات الهندسية الأصلية',
          descriptionEn: 'Original engineering tools and hardware',
          governorateId: cairoGovId,
          categories: [productCatId],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.slug).toBe('al-noor-tools');
      createdStoreId = res.body.data.id;
    });

    it('should enforce one-store constraint in MVP (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/stores/me')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          nameAr: 'متجر النور الثاني',
          nameEn: 'Al-Noor Second Store',
          slug: 'al-noor-second',
          governorateId: cairoGovId,
          categories: [productCatId],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('one store in MVP');
    });

    it('should fetch own store for merchant', async () => {
      const res = await request(app)
        .get('/api/v1/stores/me')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdStoreId);
      expect(res.body.data.status).toBe('draft');
    });

    it('should allow merchant to update store details in draft status', async () => {
      const res = await request(app)
        .patch('/api/v1/stores/me')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          descriptionAr: 'المتجر الرائد في مصر لأحدث الأدوات والمعدات',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.descriptionAr).toBe('المتجر الرائد في مصر لأحدث الأدوات والمعدات');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── E10-T01: Eligibility Gate & Moderation ──
  // ══════════════════════════════════════════════════════════════

  describe('E10-T01: Verification Gate & Store Approval', () => {
    it('should block unverified merchant from submitting store for approval (403 Forbidden)', async () => {
      // First, create store for unverified merchant
      await request(app)
        .post('/api/v1/stores/me')
        .set('Authorization', `Bearer ${unverifiedMerchantToken}`)
        .send({
          nameAr: 'متجر قيد التوثيق',
          nameEn: 'Unverified Store',
          slug: 'unverified-store',
          governorateId: cairoGovId,
          categories: [productCatId],
        });

      // Submit store -> should fail because unverified
      const res = await request(app)
        .post('/api/v1/stores/me/submit')
        .set('Authorization', `Bearer ${unverifiedMerchantToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Verification required');
    });

    it('should allow verified merchant to submit store for approval', async () => {
      const res = await request(app)
        .post('/api/v1/stores/me/submit')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending_approval');
    });

    it('should hide unapproved store from public view (404 Not Found)', async () => {
      const res = await request(app).get('/api/v1/stores/al-noor-tools');
      expect(res.status).toBe(404);
    });

    it('should allow admin to list stores pending approval and approve', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/stores?status=pending_approval')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Admin approves
      const approveRes = await request(app)
        .post(`/api/v1/admin/stores/${createdStoreId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('active');
    });

    it('should expose active store in public profile with allowlist projection', async () => {
      const res = await request(app).get('/api/v1/stores/al-noor-tools');

      expect(res.status).toBe(200);
      expect(res.body.data.nameAr).toBe('متجر النور للأدوات');
      expect(res.body.data.slug).toBe('al-noor-tools');
      expect(res.body.data.status).toBe('active');
      // Invariant: Sensitive internal fields MUST NOT exist in public DTO
      expect(res.body.data.merchantUserId).toBeUndefined();
      expect(res.body.data.rejectionReason).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── E10-T02: Product Catalog & Invariants ──
  // ══════════════════════════════════════════════════════════════

  describe('E10-T02: Product Catalog & Invariants', () => {
    it('should validate price is non-negative integer in piastres', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          titleAr: 'صاروخ جلخ أصلي 900 وات',
          titleEn: 'Angle Grinder 900W',
          slug: 'angle-grinder-900w',
          categoryId: productCatId,
          sku: 'SKU-GRIND-001',
          price: 1250.5, // float price rejected
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create product draft with integer piastres price', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          titleAr: 'صاروخ جلخ أصلي 900 وات',
          titleEn: 'Angle Grinder 900W',
          slug: 'angle-grinder-900w',
          descriptionAr: 'صاروخ جلخ احترافي ماركة بوش مع طقم أسطوانات هدية',
          descriptionEn: 'Professional Bosch grinder with free disc set',
          categoryId: productCatId,
          sku: 'SKU-GRIND-001',
          price: 185000, // 1,850.00 EGP
          compareAtPrice: 220000, // 2,200.00 EGP
          stockQuantity: 15,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.sku).toBe('SKU-GRIND-001');
      expect(res.body.data.price).toBe(185000);
      expect(res.body.data.status).toBe('draft');
      createdProductId = res.body.data.id;
    });

    it('should enforce unique SKU collision within the same store (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          titleAr: 'صاروخ جلخ موديل آخر',
          titleEn: 'Another Angle Grinder',
          slug: 'another-angle-grinder',
          categoryId: productCatId,
          sku: 'SKU-GRIND-001', // duplicate SKU
          price: 150000,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('SKU already exists');
    });

    it('should prevent cross-merchant IDOR on product operations', async () => {
      const res = await request(app)
        .patch(`/api/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${otherMerchantToken}`)
        .send({
          titleAr: 'محاولة اختراق تعديل منتج',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── E10-T02: Product Moderation & Lifecycle ──
  // ══════════════════════════════════════════════════════════════

  describe('E10-T02: Product Moderation & Public Catalog', () => {
    it('should submit product for review', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${createdProductId}/submit`)
        .set('Authorization', `Bearer ${verifiedMerchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending_approval');
    });

    it('should allow admin to reject product with reason', async () => {
      const rejectRes = await request(app)
        .post(`/api/v1/admin/products/${createdProductId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'يرجى إرفاق صور واضحة لشهادة الضمان ومواصفات المنتج' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('rejected');
      expect(rejectRes.body.data.rejectionReason).toContain('شهادة الضمان');
    });

    it('should allow merchant to edit and resubmit rejected product', async () => {
      // Edit rejected product
      await request(app)
        .patch(`/api/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${verifiedMerchantToken}`)
        .send({
          descriptionAr: 'صاروخ جلخ احترافي بوش مع شهادة ضمان معتمدة عامين كاملين',
        });

      // Resubmit
      const res = await request(app)
        .post(`/api/v1/products/${createdProductId}/submit`)
        .set('Authorization', `Bearer ${verifiedMerchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending_approval');
    });

    it('should allow admin to approve product', async () => {
      const approveRes = await request(app)
        .post(`/api/v1/admin/products/${createdProductId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('active');
    });

    it('should display active product in store public products list', async () => {
      const res = await request(app).get('/api/v1/stores/al-noor-tools/products');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(createdProductId);
      expect(res.body.data[0].price).toBe(185000);
      expect(res.body.data[0].storeSlug).toBe('al-noor-tools');
    });

    it('should display active product in single public product endpoint', async () => {
      const res = await request(app).get(`/api/v1/products/public/${createdProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.titleAr).toBe('صاروخ جلخ أصلي 900 وات');
      expect(res.body.data.price).toBe(185000);
    });

    it('should allow merchant to pause and resume product', async () => {
      // Pause
      const pauseRes = await request(app)
        .post(`/api/v1/products/${createdProductId}/pause`)
        .set('Authorization', `Bearer ${verifiedMerchantToken}`);

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.status).toBe('paused');

      // Paused product is excluded from public store catalog
      const publicList = await request(app).get('/api/v1/stores/al-noor-tools/products');
      expect(publicList.body.data.length).toBe(0);

      // Resume
      const resumeRes = await request(app)
        .post(`/api/v1/products/${createdProductId}/resume`)
        .set('Authorization', `Bearer ${verifiedMerchantToken}`);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.status).toBe('active');
    });
  });
});

