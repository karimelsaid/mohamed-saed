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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e07_requests',
    MONGODB_DB_NAME: 'mihnati_test_e07_requests',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('professional_profiles').deleteMany({});
  await db.collection('customer_profiles').deleteMany({});
  await db.collection('verification_cases').deleteMany({});
  await db.collection('service_requests').deleteMany({});
  await db.collection('offers').deleteMany({});
  await db.collection('service_orders').deleteMany({});
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

describe('E07 Custom Service Requests & Offers API', () => {
  let customerToken: string;
  let customerId: string;
  let verifiedPro1Token: string;
  let verifiedPro1Id: string;
  let verifiedPro2Token: string;
  let unverifiedProToken: string;
  let cairoId: string;
  let serviceCatId: string;

  let requestId: string;
  let offer1Id: string;
  let offer2Id: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Create Customer
    const custReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011110001',
      password: 'CustomerPassword123!',
      name: 'عميل المنصة كريم',
    });
    customerId = custReg.body.data.id;
    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01011110001',
      password: 'CustomerPassword123!',
    });
    customerToken = custLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/customer/activate')
      .set('Authorization', `Bearer ${customerToken}`);

    // 2. Create Verified Pro 1
    const pro1Reg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011110002',
      password: 'ProPassword123!',
      name: 'محمود سباك القاهرة',
    });
    verifiedPro1Id = pro1Reg.body.data.id;
    const pro1Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01011110002',
      password: 'ProPassword123!',
    });
    verifiedPro1Token = pro1Login.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${verifiedPro1Token}`);
    await db.collection('professional_profiles').updateOne(
      { userId: verifiedPro1Id },
      {
        $set: {
          verificationStatus: 'verified',
          slug: 'pro-mahmoud-cairo',
          title: 'فني سباكة أول',
        },
      }
    );

    // 3. Create Verified Pro 2
    const pro2Reg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011110003',
      password: 'ProPassword123!',
      name: 'سامح أعمال صحية',
    });
    const pro2Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01011110003',
      password: 'ProPassword123!',
    });
    verifiedPro2Token = pro2Login.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${verifiedPro2Token}`);
    await db.collection('professional_profiles').updateOne(
      { userId: pro2Reg.body.data.id },
      {
        $set: {
          verificationStatus: 'verified',
          slug: 'pro-sameh-sanitary',
          title: 'مقاول شبكات صحية',
        },
      }
    );

    // 4. Create Unverified Pro
    const unverifiedReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01011110004',
      password: 'ProPassword123!',
      name: 'مهني جديد غير موثق',
    });
    const unverifiedLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01011110004',
      password: 'ProPassword123!',
    });
    unverifiedProToken = unverifiedLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${unverifiedProToken}`);

    // Seed geography and categories lookup
    const govs = await geographyService.listGovernorates();
    cairoId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'service' });
    serviceCatId = cats[0].id;
  });

  describe('Service Request Creation & Ownership (AC-E07.1)', () => {
    it('should allow customer to create an open service request', async () => {
      const res = await request(app)
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          categoryId: serviceCatId,
          title: 'تأسيس شبكة تغذية وصرف لشقة جديدة',
          description: 'مطلوب فني محترف لتمديد مواسير التغذية والصرف لحمامين ومطبخ',
          governorateId: cairoId,
          exactAddressText: 'شارع مكرم عبيد، عمارة 24، الدور الرابع، شقة 8',
          budgetPiastres: 80000, // 800 EGP
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('open');
      expect(res.body.data.cycle).toBe(1);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.exactAddressText).toBe(
        'شارع مكرم عبيد، عمارة 24، الدور الرابع، شقة 8'
      );
      requestId = res.body.data.id;
    });

    it('should list customer own requests', async () => {
      const res = await request(app)
        .get('/api/v1/service-requests/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(requestId);
    });
  });

  describe('Opportunity Feed & Privacy Protection (AC-E07.1)', () => {
    it('should FORBID unverified professional from accessing opportunity feed', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${unverifiedProToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should ALLOW verified professional to access opportunity feed without leaking exact address', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${verifiedPro1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);

      const opportunity = res.body.data.find((o: { id: string }) => o.id === requestId);
      expect(opportunity).toBeDefined();
      expect(opportunity.title).toBe('تأسيس شبكة تغذية وصرف لشقة جديدة');
      expect(opportunity.approximateLocation.governorate).toBe('القاهرة');
      expect(opportunity.cycle).toBe(1);

      // CRITICAL SECURITY ASSERTION: Privacy of exact address & phone
      expect(opportunity.exactAddressText).toBeUndefined();
      expect(opportunity.customerId).toBeUndefined();
      expect(opportunity.phone).toBeUndefined();
    });
  });

  describe('Offer Draft, Send & Comparison (AC-E07.2)', () => {
    it('should FORBID unverified professional from sending an offer', async () => {
      const res = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${unverifiedProToken}`)
        .send({
          pricePiastres: 75000,
          estimatedDurationDays: 3,
          notes: 'أنا متاح للعمل فورا',
        });

      expect(res.status).toBe(403);
    });

    it('should allow verified pro 1 to send offer', async () => {
      const res = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${verifiedPro1Token}`)
        .send({
          pricePiastres: 75000,
          estimatedDurationDays: 3,
          notes: 'العرض يشمل كبس الشبكة بالنيتروجين واختبار التسريب بالكامل',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('sent');
      expect(res.body.data.pricePiastres).toBe(75000);
      expect(res.body.data.cycle).toBe(1);
      offer1Id = res.body.data.id;
    });

    it('should allow verified pro 2 to send competing offer', async () => {
      const res = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${verifiedPro2Token}`)
        .send({
          pricePiastres: 70000,
          estimatedDurationDays: 2,
          notes: 'جاهز بالعدة والخامات مع ضمان عامين على أعمال الصرف والتغذية',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('sent');
      expect(res.body.data.pricePiastres).toBe(70000);
      offer2Id = res.body.data.id;
    });

    it('should update offer rather than duplicate when pro 1 sends another offer in same cycle', async () => {
      const res = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${verifiedPro1Token}`)
        .send({
          pricePiastres: 72000, // Updated lower price
          estimatedDurationDays: 3,
          notes: 'تخفيض خاص للبدء غدا صباحا',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(offer1Id); // Same ID, updated in place
      expect(res.body.data.pricePiastres).toBe(72000);
    });

    it('should allow customer to list and compare all offers with professional summaries', async () => {
      const res = await request(app)
        .get(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);

      const o1 = res.body.data.find((o: { id: string }) => o.id === offer1Id);
      expect(o1).toBeDefined();
      expect(o1.professionalSummary.verificationStatus).toBe('verified');
      expect(o1.professionalSummary.slug).toBe('pro-mahmoud-cairo');
    });
  });

  describe('Atomic Accept & Superseding Competitors (AC-E07.3)', () => {
    it('should accept pro 1 offer, supersede competing pro 2 offer, and create ServiceOrder', async () => {
      const res = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers/${offer1Id}/accept`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.serviceRequestId).toBe(requestId);
      expect(res.body.data.offerId).toBe(offer1Id);
      expect(res.body.data.pricePiastres).toBe(72000);
      expect(res.body.data.status).toBe('created');

      // Verify request transitioned to in_progress
      const reqAfter = await request(app)
        .get(`/api/v1/service-requests/${requestId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(reqAfter.body.data.status).toBe('in_progress');
      expect(reqAfter.body.data.acceptedOfferId).toBe(offer1Id);

      // Verify competing offer 2 was superseded
      const offersAfter = await request(app)
        .get(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${customerToken}`);
      const o1 = offersAfter.body.data.find((o: { id: string }) => o.id === offer1Id);
      const o2 = offersAfter.body.data.find((o: { id: string }) => o.id === offer2Id);
      expect(o1.status).toBe('accepted');
      expect(o2.status).toBe('superseded');
    });

    it('should reject accepting another offer when request is already in_progress (Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers/${offer2Id}/accept`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(409);
    });
  });

  describe('Reopen Request for New Cycle (AC-E07.3)', () => {
    it('should reopen request to cycle 2 and allow fresh offers', async () => {
      const reopenRes = await request(app)
        .post(`/api/v1/service-requests/${requestId}/reopen`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.data.status).toBe('open');
      expect(reopenRes.body.data.cycle).toBe(2);

      // Pro 2 can now submit an offer for cycle 2
      const newOfferRes = await request(app)
        .post(`/api/v1/service-requests/${requestId}/offers`)
        .set('Authorization', `Bearer ${verifiedPro2Token}`)
        .send({
          pricePiastres: 68000,
          notes: 'عرض جديد لدورة العمل الثانية',
        });

      expect(newOfferRes.status).toBe(201);
      expect(newOfferRes.body.data.cycle).toBe(2);
      expect(newOfferRes.body.data.status).toBe('sent');
    });
  });
});

