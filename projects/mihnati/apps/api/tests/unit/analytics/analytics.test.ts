import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { AnalyticsService } from '../../../src/modules/analytics/analytics.service.js';
import { AuditService } from '../../../src/modules/admin/audit.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;
let analyticsService: AnalyticsService;
let auditService: AuditService;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e20_analytics',
    MONGODB_DB_NAME: 'mihnati_test_e20_analytics',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();

  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('service_orders').deleteMany({});
  await db.collection('merchant_orders').deleteMany({});
  await db.collection('commission_snapshots').deleteMany({});
  await db.collection('subscription_invoices').deleteMany({});
  await db.collection('disputes').deleteMany({});
  await db.collection('analytics_daily_snapshots').deleteMany({});
  await db.collection('analytics_exports').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});
  await db.collection('_migrations').deleteMany({});
  await db.collection('governorates').deleteMany({});
  await db.collection('categories').deleteMany({});

  auditService = new AuditService();
  analyticsService = new AnalyticsService(auditService);

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E20 Analytics, Reporting & Launch Readiness', () => {
  let regularToken: string;
  let adminToken: string;
  let supportToken: string;

  let regularUserId: string;
  let adminUserId: string;
  let supportUserId: string;

  beforeAll(async () => {
    // 1. Regular customer
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011118001', password: 'Password123!', name: 'عميل عادي' });
    regularUserId = regRes.body.data.id;
    const regLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011118001', password: 'Password123!' });
    regularToken = regLogin.body.data.accessToken;

    // 2. Admin user
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011118002', password: 'Password123!', name: 'مدير النظام' });
    adminUserId = adminRes.body.data.id;
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011118002', password: 'Password123!' });
    adminToken = adminLogin.body.data.accessToken;

    // 3. Support user
    const supRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011118003', password: 'Password123!', name: 'مسؤول دعم' });
    supportUserId = supRes.body.data.id;
    const supLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011118003', password: 'Password123!' });
    supportToken = supLogin.body.data.accessToken;

    const db = getDb();
    const now = new Date();

    // Roles
    await db.collection('user_role_assignments').insertMany([
      { _id: 'ura_admin', userId: adminUserId, roleKey: 'admin', status: 'active', grantedAt: now, createdAt: now },
      { _id: 'ura_support', userId: supportUserId, roleKey: 'support', status: 'active', grantedAt: now, createdAt: now },
      { _id: 'ura_pro1', userId: 'usr_pro_01', roleKey: 'professional', status: 'active', grantedAt: now, createdAt: now },
      { _id: 'ura_merch1', userId: 'usr_merch_01', roleKey: 'merchant', status: 'active', grantedAt: now, createdAt: now },
    ]);

    // Seed test data for analytics:
    // 1. Service order: 400 EGP (40000 piastres) - completed
    await db.collection('service_orders').insertOne({
      _id: 'sord_analytics_01',
      customerId: regularUserId,
      professionalUserId: 'usr_pro_01',
      agreedPricePiastres: 40000,
      status: 'completed',
      createdAt: now,
    });

    // 2. Service order: 600 EGP (60000 piastres) - in_progress
    await db.collection('service_orders').insertOne({
      _id: 'sord_analytics_02',
      customerId: regularUserId,
      professionalUserId: 'usr_pro_01',
      agreedPricePiastres: 60000,
      status: 'in_progress',
      createdAt: now,
    });

    // 3. Merchant order: 500 EGP (50000 piastres) - delivered
    await db.collection('merchant_orders').insertOne({
      _id: 'mord_analytics_01',
      customerId: regularUserId,
      merchantUserId: 'usr_merch_01',
      totalPiastres: 50000,
      status: 'delivered',
      createdAt: now,
    });

    // 4. Commission snapshot: 40 EGP (4000 piastres)
    await db.collection('commission_snapshots').insertOne({
      _id: 'csnap_analytics_01',
      orderId: 'sord_analytics_01',
      orderType: 'service_order',
      commissionAmountPiastres: 4000,
      calculatedAt: now,
    });

    // 5. Subscription invoice: 250 EGP (25000 piastres)
    await db.collection('subscription_invoices').insertOne({
      _id: 'sinv_analytics_01',
      subscriptionId: 'sub_test_01',
      userId: 'usr_pro_01',
      amountPiastres: 25000,
      status: 'paid',
      createdAt: now,
    });

    // 6. Dispute: 1 dispute
    await db.collection('disputes').insertOne({
      _id: 'disp_analytics_01',
      disputeNumber: 'DISP-2026-9001',
      status: 'open',
      createdAt: now,
    });

    // 7. Seed migrations & geography & taxonomy for readiness gate
    await db.collection('_migrations').insertMany([
      { version: '001', appliedAt: now },
      { version: '002', appliedAt: now },
      { version: '003', appliedAt: now },
      { version: '004', appliedAt: now },
      { version: '005', appliedAt: now },
      { version: '006', appliedAt: now },
      { version: '007', appliedAt: now },
      { version: '008', appliedAt: now },
      { version: '009', appliedAt: now },
      { version: '010', appliedAt: now },
      { version: '011', appliedAt: now },
      { version: '012', appliedAt: now },
      { version: '013', appliedAt: now },
      { version: '014', appliedAt: now },
      { version: '015', appliedAt: now },
      { version: '016', appliedAt: now },
      { version: '017', appliedAt: now },
      { version: '018', appliedAt: now },
      { version: '019', appliedAt: now },
    ]);

    await db.collection('governorates').insertOne({
      _id: 'gov_cairo',
      nameAr: 'القاهرة',
      nameEn: 'Cairo',
      code: 'CAI',
    });

    await db.collection('categories').insertOne({
      _id: 'cat_plumbing',
      nameAr: 'سباكة',
      nameEn: 'Plumbing',
      slug: 'plumbing',
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Metric Dictionary & KPI Summary (AC-E20.1) ──
  // ══════════════════════════════════════════════════════════════

  describe('Metric Dictionary & KPI Summary (AC-E20.1)', () => {
    it('AC-E20.1: should return owner-approved metric dictionary with formula, timezone, and source events', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/metrics-dictionary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);

      const gmvDef = res.body.data.find((m: any) => m.metricKey === 'gmv');
      expect(gmvDef).toBeDefined();
      expect(gmvDef.timezone).toBe('Africa/Cairo');
      expect(gmvDef.formula).toContain('SUM(service_orders.agreedPricePiastres)');
      expect(Array.isArray(gmvDef.sourceEvents)).toBe(true);
    });

    it('should compute accurate KPI summary for GMV, Platform Revenue, Rates, and Cohorts', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/kpis')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // GMV: 40000 (sord1) + 60000 (sord2) + 50000 (mord1) = 150000 piastres (1500 EGP)
      expect(data.gmv.totalPiastres).toBe(150000);
      expect(data.gmv.servicesGmvPiastres).toBe(100000);
      expect(data.gmv.commerceGmvPiastres).toBe(50000);
      expect(data.gmv.currency).toBe('EGP');

      // Platform Net Revenue: 4000 (commission) + 25000 (subscription) = 29000 piastres (290 EGP)
      expect(data.revenue.platformRevenuePiastres).toBe(29000);
      expect(data.revenue.commissionPiastres).toBe(4000);
      expect(data.revenue.subscriptionPiastres).toBe(25000);

      // Volume & Rates
      expect(data.volume.totalServiceOrders).toBe(2);
      expect(data.volume.completedServiceOrders).toBe(1);
      expect(data.volume.totalMerchantOrders).toBe(1);
      expect(data.volume.deliveredMerchantOrders).toBe(1);
      expect(data.volume.totalDisputes).toBe(1);

      // 1 completed / 2 total service orders = 50%
      expect(data.rates.serviceOrderCompletionRatePercent).toBe(50);
      // 1 delivered / 1 merchant order = 100%
      expect(data.rates.merchantFulfillmentRatePercent).toBe(100);
      // 1 dispute / 3 total orders = 33.33%
      expect(data.rates.disputeRatePercent).toBe(33.33);

      // Cohorts
      expect(data.cohorts.activeProfessionals).toBeGreaterThanOrEqual(1);
      expect(data.cohorts.activeMerchants).toBeGreaterThanOrEqual(1);
    });

    it('should allow support role with ANALYTICS_READ to view KPIs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/kpis')
        .set('Authorization', `Bearer ${supportToken}`);

      expect(res.status).toBe(200);
    });

    it('should forbid unauthenticated or regular users from viewing analytics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/kpis')
        .set('Authorization', `Bearer ${regularToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Event Projections & Idempotent Replay (AC-E20.2) ──
  // ══════════════════════════════════════════════════════════════

  describe('Event Projections & Idempotent Replay (AC-E20.2)', () => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    it('AC-E20.2: rebuildDailyMetrics should aggregate and store deterministic daily snapshot', async () => {
      const res = await request(app)
        .post('/api/v1/admin/analytics/rebuild')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ date: today });

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(`snapshot_${today}`);
      expect(res.body.data.date).toBe(today);
      expect(res.body.data.gmvPiastres).toBe(150000);
      expect(res.body.data.revenuePiastres).toBe(4000);
      expect(res.body.data.serviceOrdersCount).toBe(2);
      expect(res.body.data.merchantOrdersCount).toBe(1);
    });

    it('AC-E20.2 Replay Invariant: re-running rebuildDailyMetrics produces identical aggregate without double counting', async () => {
      // Re-run replay on the exact same date
      const res = await request(app)
        .post('/api/v1/admin/analytics/rebuild')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ date: today });

      expect(res.status).toBe(200);
      // GMV must remain 150000, NOT 300000!
      expect(res.body.data.gmvPiastres).toBe(150000);
      expect(res.body.data.serviceOrdersCount).toBe(2);
      expect(res.body.data.merchantOrdersCount).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Expiring, Scoped & Audited Exports (AC-E20.3) ──
  // ══════════════════════════════════════════════════════════════

  describe('Expiring, Scoped & Audited Exports (AC-E20.3)', () => {
    let exportId: string;

    it('AC-E20.3: should create an expiring export artifact with scoped permission and audit logging', async () => {
      const res = await request(app)
        .post('/api/v1/admin/analytics/exports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reportType: 'kpi_summary' });

      expect(res.status).toBe(201);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.requestedBy).toBe(adminUserId);
      expect(res.body.data.expiresAt).toBeDefined();
      expect(res.body.data.data.length).toBeGreaterThan(0);
      exportId = res.body.data._id;

      // Verify audit trail logged
      const db = getDb();
      const audit = await db.collection('admin_audit_logs').findOne({
        targetId: exportId,
        action: 'admin:analytics:exported',
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(adminUserId);
    });

    it('AC-E20.3 Data Minimization: export artifact must NOT contain unauthorized PII', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/analytics/exports/${exportId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body.data);
      expect(str).not.toContain('password');
      expect(str).not.toContain('token');
      expect(str).not.toContain('01011118001'); // No customer phone
      expect(str).not.toContain('streetAddress'); // No exact address
    });

    it('AC-E20.3: should reject downloading an expired export with 410 EXPORT_EXPIRED', async () => {
      // Simulate expired export by backdating expiresAt in DB
      const db = getDb();
      await db.collection('analytics_exports').updateOne(
        { _id: exportId },
        { $set: { expiresAt: new Date(Date.now() - 3600000) } } // Expired 1 hour ago
      );

      const res = await request(app)
        .get(`/api/v1/admin/analytics/exports/${exportId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('EXPORT_EXPIRED');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Launch Readiness Report & Gates Verification ──
  // ══════════════════════════════════════════════════════════════

  describe('Launch Readiness Report & Gates Verification', () => {
    it('should evaluate the 5 launch gates and return comprehensive system health status', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/launch-readiness')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.evaluatedAt).toBeDefined();
      expect(data.summary.totalGates).toBe(5);
      expect(data.summary.passedGates).toBe(5);
      expect(data.summary.isProductionReady).toBe(true);
      expect(data.overallStatus).toBe('ready');

      // Verify each gate status
      expect(data.gates.length).toBe(5);
      for (const gate of data.gates) {
        expect(gate.status).toBe('passed');
        expect(gate.details.length).toBeGreaterThan(0);
      }

      // Verify system health
      expect(data.systemHealth.database).toBe('connected');
      expect(data.systemHealth.appliedMigrationsCount).toBeGreaterThanOrEqual(18);
      expect(data.systemHealth.seedStatus.governoratesCount).toBeGreaterThanOrEqual(1);
      expect(data.systemHealth.seedStatus.taxonomiesCount).toBeGreaterThanOrEqual(1);
    });
  });
});

