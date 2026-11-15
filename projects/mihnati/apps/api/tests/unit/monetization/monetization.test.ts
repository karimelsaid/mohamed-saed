import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { CommissionsService } from '../../../src/modules/monetization/commissions.service.js';
import { SubscriptionsService } from '../../../src/modules/monetization/subscriptions.service.js';
import { AuditService } from '../../../src/modules/admin/audit.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;
let commissionsService: CommissionsService;
let subscriptionsService: SubscriptionsService;
let auditService: AuditService;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e18_monetization',
    MONGODB_DB_NAME: 'mihnati_test_e18_monetization',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();

  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('commission_rules').deleteMany({});
  await db.collection('commission_snapshots').deleteMany({});
  await db.collection('subscription_plans').deleteMany({});
  await db.collection('subscriptions').deleteMany({});
  await db.collection('subscription_invoices').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});

  auditService = new AuditService();
  commissionsService = new CommissionsService(auditService);
  subscriptionsService = new SubscriptionsService(auditService);

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E18 Monetization — Commissions & Subscriptions', () => {
  let regularToken: string;
  let adminToken1: string;
  let adminToken2: string;
  let proToken: string;

  let regularUserId: string;
  let adminUserId1: string;
  let adminUserId2: string;
  let proUserId: string;

  beforeAll(async () => {
    // 1. Regular user
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011110001', password: 'Password123!', name: 'عميل عادي' });
    regularUserId = regRes.body.data.id;
    const regLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011110001', password: 'Password123!' });
    regularToken = regLogin.body.data.accessToken;

    // 2. Admin 1 (Proposer)
    const admin1Res = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011110002', password: 'Password123!', name: 'مدير مالي أول' });
    adminUserId1 = admin1Res.body.data.id;
    const admin1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011110002', password: 'Password123!' });
    adminToken1 = admin1Login.body.data.accessToken;

    // 3. Admin 2 (Approver)
    const admin2Res = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011110003', password: 'Password123!', name: 'مدير مالي ثان' });
    adminUserId2 = admin2Res.body.data.id;
    const admin2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011110003', password: 'Password123!' });
    adminToken2 = admin2Login.body.data.accessToken;

    // 4. Professional user
    const proRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011110004', password: 'Password123!', name: 'صنايعي كهربائي' });
    proUserId = proRes.body.data.id;
    const proLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011110004', password: 'Password123!' });
    proToken = proLogin.body.data.accessToken;

    // Seed admin role assignments
    const db = getDb();
    const now = new Date();
    await db.collection('user_role_assignments').insertMany([
      {
        _id: 'ura_admin1',
        userId: adminUserId1,
        roleKey: 'admin',
        status: 'active',
        grantedAt: now,
        createdAt: now,
      },
      {
        _id: 'ura_admin2',
        userId: adminUserId2,
        roleKey: 'admin',
        status: 'active',
        grantedAt: now,
        createdAt: now,
      },
      {
        _id: 'ura_pro',
        userId: proUserId,
        roleKey: 'professional',
        status: 'active',
        grantedAt: now,
        createdAt: now,
      },
    ]);
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Commission Rules & Dual Control (E18-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Commission Rules Lifecycle & Dual Control', () => {
    let createdRuleId: string;

    it('should propose a commission rule in pending_approval status', async () => {
      const res = await request(app)
        .post('/api/v1/admin/commissions/rules')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          scope: 'services',
          nameAr: 'عمولة الخدمات الأساسية',
          nameEn: 'Base Services Commission',
          rateBps: 1000, // 10%
          fixedFeePiastres: 500, // 5 EGP
          minFeePiastres: 1000, // 10 EGP min
          maxFeePiastres: 20000, // 200 EGP max
        });

      expect(res.status).toBe(201);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.status).toBe('pending_approval');
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.proposedBy).toBe(adminUserId1);
      createdRuleId = res.body.data._id;
    });

    it('should reject proposing a rule with invalid rate or negative fee', async () => {
      const res = await request(app)
        .post('/api/v1/admin/commissions/rules')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          scope: 'services',
          nameAr: 'قاعدة غير صحيحة',
          nameEn: 'Invalid Rule',
          rateBps: 15000, // > 100%
          fixedFeePiastres: -100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should enforce Dual Control: reject approval by the same admin who proposed it', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/commissions/rules/${createdRuleId}/approve`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({ reason: 'Self approval attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should approve commission rule by a second admin', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/commissions/rules/${createdRuleId}/approve`)
        .set('Authorization', `Bearer ${adminToken2}`)
        .send({ reason: 'Dual control review approved by second finance officer' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.approvedBy).toBe(adminUserId2);
    });

    it('should archive a commission rule', async () => {
      // Propose and approve a temp rule to archive
      const tempRes = await request(app)
        .post('/api/v1/admin/commissions/rules')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          scope: 'commerce',
          nameAr: 'عمولة التجارة المؤقتة',
          nameEn: 'Temp Commerce Commission',
          rateBps: 500,
          fixedFeePiastres: 0,
        });
      const tempId = tempRes.body.data._id;

      await request(app)
        .post(`/api/v1/admin/commissions/rules/${tempId}/approve`)
        .set('Authorization', `Bearer ${adminToken2}`)
        .send({ reason: 'Approve to archive' });

      const archiveRes = await request(app)
        .post(`/api/v1/admin/commissions/rules/${tempId}/archive`)
        .set('Authorization', `Bearer ${adminToken2}`)
        .send({ reason: 'Archiving obsolete rule' });

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.data.status).toBe('archived');
    });

    it('should list commission rules with scope and status filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/commissions/rules?scope=services')
        .set('Authorization', `Bearer ${adminToken1}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].scope).toBe('services');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Calculation & Fee Disclosure (AC-E18.2) ──
  // ══════════════════════════════════════════════════════════════

  describe('Commission Quote & Calculation', () => {
    it('should return a commission quote via public endpoint before commitment', async () => {
      // 100 EGP = 10000 piastres
      // Base service rule is 10% (1000 bps) + 500 fixed = 1000 + 500 = 1500 piastres (15 EGP)
      const res = await request(app)
        .get('/api/v1/commissions/quote?scope=services&amountPiastres=10000');

      expect(res.status).toBe(200);
      expect(res.body.data.orderAmountPiastres).toBe(10000);
      expect(res.body.data.effectiveRateBps).toBe(1000);
      expect(res.body.data.fixedFeePiastres).toBe(500);
      expect(res.body.data.commissionAmountPiastres).toBe(1500);
      expect(res.body.data.netAmountPiastres).toBe(8500);
      expect(res.body.data.currency).toBe('EGP');
    });

    it('should enforce minFeePiastres when calculated commission is below floor', async () => {
      // 20 EGP = 2000 piastres
      // 10% of 2000 = 200 + 500 fixed = 700 piastres
      // But minFee is 1000 piastres (10 EGP), so it should be clamped to 1000!
      const res = await request(app)
        .get('/api/v1/commissions/quote?scope=services&amountPiastres=2000');

      expect(res.status).toBe(200);
      expect(res.body.data.commissionAmountPiastres).toBe(1000);
      expect(res.body.data.calculationDetails.cappedByMin).toBe(true);
      expect(res.body.data.netAmountPiastres).toBe(1000);
    });

    it('should enforce maxFeePiastres when calculated commission exceeds ceiling', async () => {
      // 3000 EGP = 300000 piastres
      // 10% of 300000 = 30000 + 500 = 30500 piastres
      // maxFee is 20000 piastres (200 EGP), so it should be clamped to 20000!
      const res = await request(app)
        .get('/api/v1/commissions/quote?scope=services&amountPiastres=300000');

      expect(res.status).toBe(200);
      expect(res.body.data.commissionAmountPiastres).toBe(20000);
      expect(res.body.data.calculationDetails.cappedByMax).toBe(true);
      expect(res.body.data.netAmountPiastres).toBe(280000);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Immutable Transaction Snapshots (AC-E18.1) ──
  // ══════════════════════════════════════════════════════════════

  describe('Immutable Order Commission Snapshots', () => {
    const testOrderId = 'sord_test_immutable_001';

    it('should record an order commission snapshot', async () => {
      const snapshot = await commissionsService.recordOrderCommissionSnapshot({
        orderId: testOrderId,
        orderType: 'service_order',
        amountPiastres: 50000, // 500 EGP
      });

      expect(snapshot._id).toBeDefined();
      expect(snapshot.orderId).toBe(testOrderId);
      expect(snapshot.orderAmountPiastres).toBe(50000);
      // 10% of 50000 = 5000 + 500 = 5500
      expect(snapshot.commissionAmountPiastres).toBe(5500);
      expect(snapshot.netAmountPiastres).toBe(44500);
      expect(snapshot.isCollected).toBe(false);
      expect(snapshot.collectionStatus).toBe('pending');
    });

    it('AC-E18.1 Invariant: Subsequent rule modifications do NOT mutate historical snapshot', async () => {
      // Now, propose and approve a new version of the services rule with 20% (2000 bps) + 1000 fee
      const v2Res = await request(app)
        .post('/api/v1/admin/commissions/rules')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          scope: 'services',
          nameAr: 'عمولة الخدمات الإصدار الثاني',
          nameEn: 'Services Commission v2',
          rateBps: 2000,
          fixedFeePiastres: 1000,
        });

      await request(app)
        .post(`/api/v1/admin/commissions/rules/${v2Res.body.data._id}/approve`)
        .set('Authorization', `Bearer ${adminToken2}`)
        .send({ reason: 'Approve v2' });

      // Calling recordOrderCommissionSnapshot again for the same order returns the old snapshot intact!
      const fetched = await commissionsService.recordOrderCommissionSnapshot({
        orderId: testOrderId,
        orderType: 'service_order',
        amountPiastres: 50000,
      });

      // It must STILL have the original 5500 commission, NOT the new 11000 commission!
      expect(fetched.commissionAmountPiastres).toBe(5500);
      expect(fetched.ruleVersion).toBe(1);
    });

    it('should list snapshots and allow finance admin to update collection status', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/commissions/snapshots?orderType=service_order')
        .set('Authorization', `Bearer ${adminToken1}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      const snapshotId = listRes.body.data[0]._id;

      // Update collection status to 'collected'
      const updateRes = await request(app)
        .post(`/api/v1/admin/commissions/snapshots/${snapshotId}/collection-status`)
        .set('Authorization', `Bearer ${adminToken2}`)
        .send({ status: 'collected', notes: 'Settled via cash receipt' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.isCollected).toBe(true);
      expect(updateRes.body.data.collectionStatus).toBe('collected');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Subscription Plans Management (E18-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('Subscription Plans Management', () => {
    it('should create subscription plans for professional and merchant', async () => {
      // 1. Free plan
      const freeRes = await request(app)
        .post('/api/v1/admin/subscriptions/plans')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          planCode: 'pro_free',
          targetRole: 'professional',
          tier: 'free',
          nameAr: 'الباقة المجانية للمحترفين',
          nameEn: 'Professional Free Tier',
          descriptionAr: 'الباقة الأساسية للبدء في تلقي طلبات الخدمة',
          pricePiastres: 0,
          billingInterval: 'monthly',
          durationDays: 30,
          features: {
            maxListings: 5,
            commissionDiscountBps: 0,
            priorityPlacement: false,
          },
        });

      expect(freeRes.status).toBe(201);
      expect(freeRes.body.data.planCode).toBe('pro_free');

      // 2. Pro plan with commission discount
      const proPlanRes = await request(app)
        .post('/api/v1/admin/subscriptions/plans')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          planCode: 'pro_premium',
          targetRole: 'professional',
          tier: 'pro',
          nameAr: 'باقة المحترف المميزة',
          nameEn: 'Professional Premium Tier',
          descriptionAr: 'أولوية في الظهور وخصم على العمولات',
          pricePiastres: 25000, // 250 EGP/mo
          billingInterval: 'monthly',
          durationDays: 30,
          features: {
            maxListings: 50,
            commissionDiscountBps: 300, // 3% commission discount
            priorityPlacement: true,
            verifiedBadge: true,
          },
        });

      expect(proPlanRes.status).toBe(201);
      expect(proPlanRes.body.data.planCode).toBe('pro_premium');
    });

    it('should list active subscription plans publicly', async () => {
      const res = await request(app).get('/api/v1/subscriptions/plans?role=professional');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject creating duplicate planCode', async () => {
      const res = await request(app)
        .post('/api/v1/admin/subscriptions/plans')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          planCode: 'pro_free',
          targetRole: 'professional',
          tier: 'free',
          nameAr: 'مكرر',
          nameEn: 'Duplicate',
          descriptionAr: 'تكرار',
          pricePiastres: 0,
          billingInterval: 'monthly',
          durationDays: 30,
          features: {},
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 5. Subscription Lifecycle, Billing Gate & Idempotency ──
  // ══════════════════════════════════════════════════════════════

  describe('Subscription Lifecycle & Billing Gate (AC-E18.2 / AC-E18.3)', () => {
    let activeSubId: string;

    it('should allow professional to subscribe to free tier immediately', async () => {
      const res = await request(app)
        .post('/api/v1/subscriptions/subscribe')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          planCode: 'pro_free',
          roleKey: 'professional',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.subscription).toBeDefined();
      expect(res.body.data.subscription.planCode).toBe('pro_free');
      expect(res.body.data.subscription.status).toBe('active');
      expect(res.body.data.invoice.amountPiastres).toBe(0);
      expect(res.body.data.invoice.paymentMethod).toBe('free_grant');
      activeSubId = res.body.data.subscription._id;
    });

    it('should reject duplicate subscription to the same active plan', async () => {
      const res = await request(app)
        .post('/api/v1/subscriptions/subscribe')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          planCode: 'pro_free',
          roleKey: 'professional',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_SUBSCRIPTION');
    });

    it('AC-E18.2: Electronic billing gate fails closed on paid plan without approved event', async () => {
      const res = await request(app)
        .post('/api/v1/subscriptions/subscribe')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          planCode: 'pro_premium',
          roleKey: 'professional',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BILLING_GATE_CLOSED');
    });

    it('should activate paid plan when approved providerEventId is supplied', async () => {
      const providerEventId = 'evt_psp_mock_999888';
      const res = await request(app)
        .post('/api/v1/subscriptions/subscribe')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          planCode: 'pro_premium',
          roleKey: 'professional',
          providerEventId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.subscription.planCode).toBe('pro_premium');
      expect(res.body.data.subscription.status).toBe('active');
      expect(res.body.data.invoice.amountPiastres).toBe(25000);
      expect(res.body.data.invoice.providerEventId).toBe(providerEventId);
      activeSubId = res.body.data.subscription._id;
    });

    it('should apply subscription discount on commission quote for premium subscriber', async () => {
      // Premium plan gives 300 bps (3%) discount on commission
      // Rule rate is 20% (2000 bps) -> effective rate becomes 17% (1700 bps)
      const res = await request(app)
        .get(`/api/v1/commissions/quote?scope=services&amountPiastres=10000&professionalUserId=${proUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.commissionDiscountBps).toBe(300);
      expect(res.body.data.effectiveRateBps).toBe(1700);
    });

    it('AC-E18.3: Renewal with same providerEventId is idempotent and does not duplicate invoice', async () => {
      const eventId = 'evt_renewal_111';

      // First renewal
      const res1 = await request(app)
        .post(`/api/v1/admin/subscriptions/${activeSubId}/renew`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({ providerEventId: eventId });

      expect(res1.status).toBe(200);
      const invoice1 = res1.body.data.invoice._id;

      // Duplicate webhook renewal event
      const res2 = await request(app)
        .post(`/api/v1/admin/subscriptions/${activeSubId}/renew`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({ providerEventId: eventId });

      expect(res2.status).toBe(200);
      const invoice2 = res2.body.data.invoice._id;

      // Identical invoice returned, no duplicate created
      expect(invoice1).toBe(invoice2);
    });

    it('should cancel subscription at period end', async () => {
      const res = await request(app)
        .post(`/api/v1/subscriptions/${activeSubId}/cancel`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ reason: 'Moving to another service' });

      expect(res.status).toBe(200);
      expect(res.body.data.cancelAtPeriodEnd).toBe(true);
      expect(res.body.data.autoRenew).toBe(false);
    });

    it('should list user invoices and subscriptions in admin', async () => {
      const invoicesRes = await request(app)
        .get('/api/v1/subscriptions/invoices')
        .set('Authorization', `Bearer ${proToken}`);

      expect(invoicesRes.status).toBe(200);
      expect(invoicesRes.body.data.length).toBeGreaterThanOrEqual(1);

      const adminSubsRes = await request(app)
        .get('/api/v1/admin/subscriptions')
        .set('Authorization', `Bearer ${adminToken1}`);

      expect(adminSubsRes.status).toBe(200);
      expect(adminSubsRes.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});

