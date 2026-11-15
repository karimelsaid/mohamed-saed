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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e08_orders',
    MONGODB_DB_NAME: 'mihnati_test_e08_orders',
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
  await db.collection('service_requests').deleteMany({});
  await db.collection('offers').deleteMany({});
  await db.collection('service_orders').deleteMany({});
  await db.collection('appointments').deleteMany({});
  await db.collection('order_change_requests').deleteMany({});
  await db.collection('address_consent_logs').deleteMany({});
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

describe('E08 Service Orders & Scheduling API', () => {
  let customerToken: string;
  let customerId: string;
  let proToken: string;
  let proUserId: string;
  let otherUserToken: string;
  let cairoId: string;
  let serviceCatId: string;

  let requestId: string;
  let offerId: string;
  let orderId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Create Customer
    const custReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01022220001',
      password: 'CustPassword123!',
      name: 'عميل الصيانة أحمد',
    });
    customerId = custReg.body.data.id;
    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01022220001',
      password: 'CustPassword123!',
    });
    customerToken = custLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/customer/activate')
      .set('Authorization', `Bearer ${customerToken}`);

    // 2. Create Verified Pro
    const proReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01022220002',
      password: 'ProPassword123!',
      name: 'الفني المتخصص إبراهيم',
    });
    proUserId = proReg.body.data.id;
    const proLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01022220002',
      password: 'ProPassword123!',
    });
    proToken = proLogin.body.data.accessToken;
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${proToken}`);
    await db.collection('professional_profiles').updateOne(
      { userId: proUserId },
      {
        $set: {
          verificationStatus: 'verified',
          slug: 'pro-ibrahim-tech',
          title: 'فني كهرباء وصيانة منازل',
        },
      }
    );

    // 3. Create Unrelated Third-Party User
    const otherReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01022220003',
      password: 'OtherPassword123!',
      name: 'مستخدم غريب',
    });
    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01022220003',
      password: 'OtherPassword123!',
    });
    otherUserToken = otherLogin.body.data.accessToken;

    const govs = await geographyService.listGovernorates();
    cairoId = govs.find((g) => g.code === 'CAI')!._id;

    const cats = await taxonomyService.listCategories({ type: 'service' });
    serviceCatId = cats[0].id;

    // Create Service Request by Customer
    const reqRes = await request(app)
      .post('/api/v1/service-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        categoryId: serviceCatId,
        title: 'صيانة لوحة القواطع الرئيسية وتغيير المفاتيح',
        description: 'فصل متكرر في قاطع التكييف ولوحة الكهرباء الرئيسية بالمدخل',
        governorateId: cairoId,
        exactAddressText: 'شارع مصطفى النحاس، برج النور، الدور التاسع، شقة 33',
        budgetPiastres: 50000,
      });
    requestId = reqRes.body.data.id;

    // Send Offer by Pro
    const offerRes = await request(app)
      .post(`/api/v1/service-requests/${requestId}/offers`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({
        pricePiastres: 45000,
        estimatedDurationDays: 1,
        notes: 'شامل الفحص بالأجهزة والمفاتيح شنيدر الأصلية',
      });
    offerId = offerRes.body.data.id;

    // Accept Offer to create ServiceOrder
    const acceptRes = await request(app)
      .post(`/api/v1/service-requests/${requestId}/offers/${offerId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    orderId = acceptRes.body.data.id;
  });

  describe('Service Order Access & Participants Only (AC-E08.1)', () => {
    it('should allow customer and assigned pro to access order', async () => {
      const custRes = await request(app)
        .get(`/api/v1/service-orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custRes.status).toBe(200);
      expect(custRes.body.data._id).toBe(orderId);
      expect(custRes.body.data.status).toBe('created');

      const proRes = await request(app)
        .get(`/api/v1/service-orders/${orderId}`)
        .set('Authorization', `Bearer ${proToken}`);
      expect(proRes.status).toBe(200);
      expect(proRes.body.data._id).toBe(orderId);
    });

    it('should FORBID unrelated user from viewing the order (Access Control)', async () => {
      const res = await request(app)
        .get(`/api/v1/service-orders/${orderId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Appointment Proposal & Confirmation (AC-E08.2)', () => {
    let apptId: string;

    it('should allow pro to propose an appointment slot', async () => {
      const appointmentDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post(`/api/v1/service-orders/${orderId}/appointments`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          scheduledAt: appointmentDate,
          timezone: 'Africa/Cairo',
          notes: 'الموعد المناسب لزيارة الفحص والمعاينة',
        });

      expect(res.status).toBe(201);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.proposedBy).toBe('professional');
      expect(res.body.data.status).toBe('proposed');
      apptId = res.body.data._id;
    });

    it('should prevent the proposer from confirming their own appointment', async () => {
      const res = await request(app)
        .post(`/api/v1/appointments/${apptId}/confirm`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(400);
    });

    it('should allow customer to confirm proposed appointment and transition order to scheduled', async () => {
      const res = await request(app)
        .post(`/api/v1/appointments/${apptId}/confirm`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');

      const orderAfter = await request(app)
        .get(`/api/v1/service-orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(orderAfter.body.data.status).toBe('scheduled');
    });
  });

  describe('Address Consent & Execution Address Reveal (AC-E08.3)', () => {
    it('should BLOCK professional from reading address text when consent is NOT granted', async () => {
      const res = await request(app)
        .get(`/api/v1/service-orders/${orderId}/execution-address`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow customer to grant address consent', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${orderId}/address-consent`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.addressConsentGranted).toBe(true);

      // Verify consent log was created
      const db = getDb();
      const consentLog = await db.collection('address_consent_logs').findOne({
        serviceOrderId: orderId,
        action: 'granted',
      });
      expect(consentLog).toBeDefined();
    });

    it('should ALLOW professional to read exact address text AFTER consent is granted', async () => {
      const res = await request(app)
        .get(`/api/v1/service-orders/${orderId}/execution-address`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.exactAddressText).toBe(
        'شارع مصطفى النحاس، برج النور، الدور التاسع، شقة 33'
      );
      expect(res.body.data.governorate).toBe('القاهرة');

      // Verify reveal was logged in audit log
      const db = getDb();
      const auditLog = await db.collection('admin_audit_logs').findOne({
        targetId: orderId,
        action: 'service_order:address_revealed',
      });
      expect(auditLog).toBeDefined();
    });

    it('should allow customer to revoke address consent and re-block access', async () => {
      const revokeRes = await request(app)
        .delete(`/api/v1/service-orders/${orderId}/address-consent`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.addressConsentGranted).toBe(false);

      const accessAfter = await request(app)
        .get(`/api/v1/service-orders/${orderId}/execution-address`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(accessAfter.status).toBe(403);
    });
  });

  describe('Mutual Order Change Requests (AC-E08.3)', () => {
    let changeId: string;

    it('should allow pro to propose order change (scope/price revision)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${orderId}/change-requests`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          proposedPricePiastres: 55000, // Price increased after inspection
          proposedScopeSummary: 'إضافة استبدال الكابل الرئيسي المحترق مع القواطع',
          reason: 'وجود تلف إضافي في كابل التغذية الرئيسي بعد الفحص الميداني',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.proposedPricePiastres).toBe(55000);
      changeId = res.body.data._id;
    });

    it('should forbid the requesting pro from self-accepting their own change request', async () => {
      const res = await request(app)
        .post(`/api/v1/order-change-requests/${changeId}/decide`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ decision: 'accepted' });

      expect(res.status).toBe(403);
    });

    it('should allow customer to accept change request and atomically update order', async () => {
      const res = await request(app)
        .post(`/api/v1/order-change-requests/${changeId}/decide`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          decision: 'accepted',
          notes: 'موافق على تغيير السعر بعد معاينة الكابل التالف',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('accepted');

      // Verify order price and scope updated
      const orderAfter = await request(app)
        .get(`/api/v1/service-orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(orderAfter.body.data.pricePiastres).toBe(55000);
      expect(orderAfter.body.data.scopeSummary).toBe(
        'إضافة استبدال الكابل الرئيسي المحترق مع القواطع'
      );
    });
  });

  describe('Order Execution Lifecycle to Completion (AC-E08.1)', () => {
    it('should start order (in_progress)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${orderId}/start`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('should submit order upon work finish (submitted)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('submitted');
      expect(res.body.data.submittedAt).toBeDefined();
    });

    it('should confirm completion by customer and close service request atomically (completed)', async () => {
      const res = await request(app)
        .post(`/api/v1/service-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completedAt).toBeDefined();

      // Check that the underlying service request is also marked completed
      const reqAfter = await request(app)
        .get(`/api/v1/service-requests/${requestId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(reqAfter.body.data.status).toBe('completed');
    });
  });
});

