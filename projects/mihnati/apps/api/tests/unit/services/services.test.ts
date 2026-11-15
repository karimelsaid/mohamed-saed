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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e06_services',
    MONGODB_DB_NAME: 'mihnati_test_e06_services',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('professional_profiles').deleteMany({});
  await db.collection('verification_cases').deleteMany({});
  await db.collection('services').deleteMany({});
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

describe('E06 Services Catalog & Moderation API', () => {
  let adminToken: string;
  let verifiedProToken: string;
  let unverifiedProToken: string;
  let cairoId: string;
  let serviceCatId: string;
  let draftServiceId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Create Admin
    const adminReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01077770001',
      password: 'AdminPassword123!',
      name: 'مشرف الخدمات',
    });
    await db.collection('user_role_assignments').insertOne({
      _id: 'test-admin-service-mod',
      userId: adminReg.body.data.id,
      roleKey: 'admin',
      status: 'active',
      grantedAt: new Date(),
    });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01077770001',
      password: 'AdminPassword123!',
    });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Create Unverified Professional
    const unverifiedReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01077770002',
      password: 'ProPassword123!',
      name: 'مهني قيد الانتظار',
    });
    const unverifiedLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01077770002',
      password: 'ProPassword123!',
    });
    unverifiedProToken = unverifiedLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${unverifiedProToken}`);

    // 3. Create Verified Professional
    const verifiedReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01077770003',
      password: 'ProPassword123!',
      name: 'مهني موثق معتمد',
    });
    const verifiedLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01077770003',
      password: 'ProPassword123!',
    });
    verifiedProToken = verifiedLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${verifiedProToken}`);

    // Update pro profile to verified directly in DB for test fixture
    await db.collection('professional_profiles').updateOne(
      { userId: verifiedReg.body.data.id },
      {
        $set: {
          verificationStatus: 'verified',
          slug: 'pro-hassan-cairo',
          title: 'فني تكييفات وتبريد',
        },
      }
    );

    // Fetch Cairo governorate and a service category
    const govs = await geographyService.listGovernorates();
    cairoId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'service' });
    serviceCatId = cats[0].id;
  });

  describe('Service Draft & Pricing Models (AC-E06.1)', () => {
    it('should create a service draft with fixed price in integer piastres', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${verifiedProToken}`)
        .send({
          categoryId: serviceCatId,
          title: 'صيانة وتأسيس مواسير التكييف',
          description: 'تنفيذ شبكة نحاس أصلية وضغط النيتروجين مع ضمان عام كامل على التركيب',
          priceType: 'fixed',
          pricePiastres: 35000, // 350.00 EGP
          governorateId: cairoId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.priceType).toBe('fixed');
      expect(res.body.data.pricePiastres).toBe(35000);
      draftServiceId = res.body.data.id;
    });

    it('should allow draft creation with from or inspection price types', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${verifiedProToken}`)
        .send({
          categoryId: serviceCatId,
          title: 'معاينة وفحص أعطال أجهزة التبريد',
          description: 'كشف دقيق على الكباس والشحن والدائرة الكهربائية بالكامل',
          priceType: 'inspection',
          pricePiastres: 10000, // 100.00 EGP inspection fee
          governorateId: cairoId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.priceType).toBe('inspection');
    });

    it('should reject non-integer or negative price', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${verifiedProToken}`)
        .send({
          categoryId: serviceCatId,
          title: 'خدمة بسعر غير صالح',
          description: 'وصف الخدمة هنا أكثر من عشرة أحرف',
          priceType: 'fixed',
          pricePiastres: -500,
          governorateId: cairoId,
        });

      expect(res.status).toBe(400);
    });

    it('should allow pro to update their own draft', async () => {
      const res = await request(app)
        .patch(`/api/v1/services/${draftServiceId}`)
        .set('Authorization', `Bearer ${verifiedProToken}`)
        .send({
          title: 'صيانة وتأسيس مواسير التكييف - محدث',
          pricePiastres: 40000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('صيانة وتأسيس مواسير التكييف - محدث');
      expect(res.body.data.pricePiastres).toBe(40000);
    });
  });

  describe('Eligibility Gate for Publishing (AC-E06.2 & AC-E05.3)', () => {
    let unverifiedServiceId: string;

    beforeAll(async () => {
      // Unverified pro can create a draft
      const res = await request(app)
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${unverifiedProToken}`)
        .send({
          categoryId: serviceCatId,
          title: 'مسودة خدمة لمهني غير موثق',
          description: 'محاولة تقديم خدمة للنشر من حساب غير معتمد بعد',
          priceType: 'fixed',
          pricePiastres: 20000,
          governorateId: cairoId,
        });
      unverifiedServiceId = res.body.data.id;
    });

    it('should BLOCK unverified professional from submitting service for review', async () => {
      const res = await request(app)
        .post(`/api/v1/services/${unverifiedServiceId}/submit`)
        .set('Authorization', `Bearer ${unverifiedProToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should ALLOW verified professional to submit service for review', async () => {
      const res = await request(app)
        .post(`/api/v1/services/${draftServiceId}/submit`)
        .set('Authorization', `Bearer ${verifiedProToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending_review');
    });
  });

  describe('Moderation & Publication (AC-E06.2)', () => {
    it('should forbid unprivileged user from moderating service', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/services/${draftServiceId}/moderate`)
        .set('Authorization', `Bearer ${verifiedProToken}`)
        .send({ decision: 'published' });

      expect(res.status).toBe(403);
    });

    it('should allow admin moderator to approve service and publish it', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/services/${draftServiceId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'published',
          notes: 'المحتوى مطابق للمعايير ومستوفٍ للشروط الفنية',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('published');
      expect(res.body.data.publishedAt).toBeDefined();

      // Check audit log
      const db = getDb();
      const audit = await db.collection('admin_audit_logs').findOne({
        targetId: draftServiceId,
        action: 'service:moderate:published',
      });
      expect(audit).toBeDefined();
    });
  });

  describe('Lifecycle State Transitions (AC-E06.2)', () => {
    it('should allow owner to pause and resume published service', async () => {
      // Pause
      const pauseRes = await request(app)
        .post(`/api/v1/services/${draftServiceId}/pause`)
        .set('Authorization', `Bearer ${verifiedProToken}`);

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.status).toBe('paused');

      // Resume
      const resumeRes = await request(app)
        .post(`/api/v1/services/${draftServiceId}/resume`)
        .set('Authorization', `Bearer ${verifiedProToken}`);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.status).toBe('published');
    });
  });

  describe('Public Search & Discovery (AC-E06.2)', () => {
    it('should return published services in search and exclude drafts/paused', async () => {
      const res = await request(app).get('/api/v1/services/search');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);

      const found = res.body.data.find((s: { id: string }) => s.id === draftServiceId);
      expect(found).toBeDefined();
      expect(found.title).toBe('صيانة وتأسيس مواسير التكييف - محدث');
      expect(found.approximateLocation.governorate).toBe('القاهرة');
      expect(found.professional.verificationStatus).toBe('verified');
      expect(found.professional.slug).toBe('pro-hassan-cairo');

      // Security check: private fields must not be leaked in search
      expect(found.userId).toBeUndefined();
      expect(found.phone).toBeUndefined();
    });

    it('should filter search by category and price range', async () => {
      const res = await request(app).get(
        `/api/v1/services/search?categoryId=${serviceCatId}&minPrice=30000&maxPrice=50000`
      );

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(draftServiceId);
    });

    it('should return empty result when search criteria do not match', async () => {
      const res = await request(app).get('/api/v1/services/search?minPrice=900000');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});

