import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { AdvertisingService } from '../../../src/modules/advertising/advertising.service.js';
import { AuditService } from '../../../src/modules/admin/audit.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;
let advertisingService: AdvertisingService;
let auditService: AuditService;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e19_advertising',
    MONGODB_DB_NAME: 'mihnati_test_e19_advertising',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();

  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('services').deleteMany({});
  await db.collection('stores').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('ad_campaigns').deleteMany({});
  await db.collection('ad_delivery_events').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});

  auditService = new AuditService();
  advertisingService = new AdvertisingService(auditService);

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E19 Advertising & Promotion', () => {
  let regularToken: string;
  let adminToken: string;
  let proToken: string;
  let merchantToken: string;

  let regularUserId: string;
  let adminUserId: string;
  let proUserId: string;
  let merchantUserId: string;

  let testServiceId: string;
  let testStoreId: string;
  let testProductId: string;

  beforeAll(async () => {
    // 1. Regular user
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011119001', password: 'Password123!', name: 'مستخدم عادي' });
    regularUserId = regRes.body.data.id;
    const regLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011119001', password: 'Password123!' });
    regularToken = regLogin.body.data.accessToken;

    // 2. Admin user
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011119002', password: 'Password123!', name: 'مدير إعلانات' });
    adminUserId = adminRes.body.data.id;
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011119002', password: 'Password123!' });
    adminToken = adminLogin.body.data.accessToken;

    // 3. Professional user
    const proRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011119003', password: 'Password123!', name: 'فني تكييف' });
    proUserId = proRes.body.data.id;
    const proLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011119003', password: 'Password123!' });
    proToken = proLogin.body.data.accessToken;

    // 4. Merchant user
    const merchRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ phone: '01011119004', password: 'Password123!', name: 'تاجر عدد وأدوات' });
    merchantUserId = merchRes.body.data.id;
    const merchLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011119004', password: 'Password123!' });
    merchantToken = merchLogin.body.data.accessToken;

    const db = getDb();
    const now = new Date();

    // Roles
    await db.collection('user_role_assignments').insertMany([
      { _id: 'ura_admin', userId: adminUserId, roleKey: 'admin', status: 'active', grantedAt: now, createdAt: now },
      { _id: 'ura_pro', userId: proUserId, roleKey: 'professional', status: 'active', grantedAt: now, createdAt: now },
      { _id: 'ura_merch', userId: merchantUserId, roleKey: 'merchant', status: 'active', grantedAt: now, createdAt: now },
    ]);

    // Target Service
    testServiceId = 'srv_ac_repair_001';
    await db.collection('services').insertOne({
      _id: testServiceId,
      professionalUserId: proUserId,
      titleAr: 'صيانة وتصليح تكييفات شارب',
      titleEn: 'Sharp AC Maintenance',
      status: 'active',
      createdAt: now,
    });

    // Target Store & Product
    testStoreId = 'store_tools_001';
    await db.collection('stores').insertOne({
      _id: testStoreId,
      merchantUserId: merchantUserId,
      nameAr: 'متجر العدد والأدوات الصناعية',
      nameEn: 'Industrial Tools Store',
      status: 'active',
      createdAt: now,
    });

    testProductId = 'prod_drill_001';
    await db.collection('products').insertOne({
      _id: testProductId,
      storeId: testStoreId,
      nameAr: 'شنيور بوش أصلي 600 وات',
      nameEn: 'Bosch Rotary Drill 600W',
      status: 'active',
      createdAt: now,
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Campaign Setup & Targeting Privacy (E19-T01 / AC-E19.3) ──
  // ══════════════════════════════════════════════════════════════

  describe('Campaign Setup & Targeting Privacy (AC-E19.3)', () => {
    let proCampaignId: string;

    it('should create an ad campaign in pending_review status for owned service', async () => {
      const now = new Date();
      const startDate = now.toISOString();
      const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/v1/advertising/campaigns')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          campaignType: 'promoted_service',
          targetId: testServiceId,
          titleAr: 'حملة ترويج صيانة التكييفات',
          titleEn: 'AC Maintenance Campaign',
          budgetPiastres: 10000, // 100 EGP
          costPerImpressionPiastres: 20, // 0.20 EGP
          costPerClickPiastres: 150, // 1.50 EGP
          startDate,
          endDate,
          targeting: {
            governorateIds: ['gov_cairo'],
            categoryIds: ['cat_ac'],
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.status).toBe('pending_review');
      expect(res.body.data.budgetPiastres).toBe(10000);
      expect(res.body.data.spentPiastres).toBe(0);
      proCampaignId = res.body.data._id;
    });

    it('should create an ad campaign for merchant product', async () => {
      const now = new Date();
      const startDate = now.toISOString();
      const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/v1/advertising/campaigns')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          advertiserRole: 'merchant',
          campaignType: 'promoted_product',
          targetId: testProductId,
          titleAr: 'حملة ترويج شنيور بوش',
          titleEn: 'Bosch Drill Promotion',
          budgetPiastres: 20000,
          startDate,
          endDate,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.campaignType).toBe('promoted_product');
      expect(res.body.data.status).toBe('pending_review');
    });

    it('should reject creating campaign for target service not owned by advertiser', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/advertising/campaigns')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          campaignType: 'promoted_service',
          targetId: testServiceId, // Belongs to proUserId, not merchantUserId
          titleAr: 'محاولة ترويج خدمة الغير',
          titleEn: 'Invalid Promotion',
          budgetPiastres: 5000,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
        });

      expect(res.status).toBe(404);
    });

    it('AC-E19.3: should reject targeting with sensitive personal data', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/advertising/campaigns')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          campaignType: 'promoted_service',
          targetId: testServiceId,
          titleAr: 'حملة باستهداف محظور',
          titleEn: 'Sensitive Target Campaign',
          budgetPiastres: 5000,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
          targeting: {
            religion: 'any_prohibited_value',
            health: 'sensitive_health_category',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SENSITIVE_TARGETING_PROHIBITED');
    });

    it('should reject campaign with invalid dates (endDate before startDate)', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/advertising/campaigns')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          campaignType: 'promoted_service',
          targetId: testServiceId,
          titleAr: 'تواريخ غير صحيحة',
          titleEn: 'Invalid Dates',
          budgetPiastres: 5000,
          startDate: new Date(now.getTime() + 100000).toISOString(),
          endDate: now.toISOString(), // in the past of startDate!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Campaign Moderation & Lifecycle (E19-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('Campaign Moderation & Lifecycle', () => {
    let testCampaignId: string;

    beforeAll(async () => {
      const now = new Date();
      const camp = await advertisingService.createCampaign(proUserId, 'professional', {
        campaignType: 'promoted_service',
        targetId: testServiceId,
        titleAr: 'حملة للمراجعة والاعتماد',
        titleEn: 'Review Lifecycle Campaign',
        budgetPiastres: 8000,
        costPerImpressionPiastres: 20,
        costPerClickPiastres: 100,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 5 * 86400000).toISOString(),
      });
      testCampaignId = camp._id;
    });

    it('should approve campaign by admin and transition to active', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/advertising/campaigns/${testCampaignId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.moderatedBy).toBe(adminUserId);
    });

    it('should allow advertiser to pause an active campaign', async () => {
      const res = await request(app)
        .post(`/api/v1/advertising/campaigns/${testCampaignId}/pause`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ reason: 'Temporarily pausing' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paused');
    });

    it('should forbid other users from pausing someone else campaign', async () => {
      const res = await request(app)
        .post(`/api/v1/advertising/campaigns/${testCampaignId}/pause`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ reason: 'Malicious attempt' });

      expect(res.status).toBe(403);
    });

    it('should allow advertiser to resume a paused campaign', async () => {
      const res = await request(app)
        .post(`/api/v1/advertising/campaigns/${testCampaignId}/resume`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should reject a campaign with mandatory reason', async () => {
      const now = new Date();
      const tempCamp = await advertisingService.createCampaign(proUserId, 'professional', {
        campaignType: 'promoted_service',
        targetId: testServiceId,
        titleAr: 'حملة سترفض',
        titleEn: 'Rejected Campaign',
        budgetPiastres: 3000,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 86400000).toISOString(),
      });

      const res = await request(app)
        .post(`/api/v1/admin/advertising/campaigns/${tempCamp._id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'reject', reason: 'Misleading promotion wording' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectionReason).toBe('Misleading promotion wording');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Placements & Visible Labeling (AC-E19.1 / AC-E19.2) ──
  // ══════════════════════════════════════════════════════════════

  describe('Sponsored Placements & Visible Labeling (AC-E19.1 / AC-E19.2)', () => {
    let activeCampaignId: string;

    beforeAll(async () => {
      const now = new Date();
      const camp = await advertisingService.createCampaign(proUserId, 'professional', {
        campaignType: 'promoted_service',
        targetId: testServiceId,
        titleAr: 'خدمة ممولة للظهور',
        titleEn: 'Promoted Service for Placement',
        budgetPiastres: 5000,
        costPerImpressionPiastres: 20,
        costPerClickPiastres: 100,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 3 * 86400000).toISOString(),
      });
      activeCampaignId = camp._id;
      await advertisingService.moderateCampaign(adminUserId, activeCampaignId, { action: 'approve' });
    });

    it('AC-E19.1: should return sponsored placements visibly labeled with isSponsored: true and sponsorLabelAr: "إعلان ممول"', async () => {
      const res = await request(app)
        .get('/api/v1/advertising/sponsored-placements?placement=search_services');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const item = res.body.data[0];
      expect(item.isSponsored).toBe(true);
      expect(item.sponsorLabelAr).toBe('إعلان ممول');
      expect(item.sponsorLabelEn).toBe('Sponsored');
      expect(item.targetType).toBe('promoted_service');
      expect(item.item._id).toBe(testServiceId);
    });

    it('AC-E19.2: unapproved or paused campaign DOES NOT appear in sponsored placements', async () => {
      // Pause the active campaign
      await advertisingService.pauseCampaign(proUserId, activeCampaignId);

      const res = await request(app)
        .get('/api/v1/advertising/sponsored-placements?placement=search_services');

      expect(res.status).toBe(200);
      const found = res.body.data.find((item: any) => item.campaignId === activeCampaignId);
      expect(found).toBeUndefined();

      // Resume for subsequent tests
      await advertisingService.resumeCampaign(proUserId, activeCampaignId);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Atomic Delivery Events, Budget Cap & Deduplication ──
  // ══════════════════════════════════════════════════════════════

  describe('Delivery Events, Budget Cap & Deduplication (AC-E19.2)', () => {
    let cappedCampaignId: string;

    beforeAll(async () => {
      const now = new Date();
      // Budget = 200 piastres (2.00 EGP)
      // Cost per impression = 50 piastres
      // Cost per click = 150 piastres
      const camp = await advertisingService.createCampaign(proUserId, 'professional', {
        campaignType: 'promoted_service',
        targetId: testServiceId,
        titleAr: 'حملة لميزانية محدودة',
        titleEn: 'Limited Budget Campaign',
        budgetPiastres: 200,
        costPerImpressionPiastres: 50,
        costPerClickPiastres: 150,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 86400000).toISOString(),
      });
      cappedCampaignId = camp._id;
      await advertisingService.moderateCampaign(adminUserId, cappedCampaignId, { action: 'approve' });
    });

    it('should record an impression event and increment spend', async () => {
      const res = await request(app)
        .post('/api/v1/advertising/events')
        .send({
          campaignId: cappedCampaignId,
          eventType: 'impression',
          placementContext: 'search_services',
          idempotencyKey: 'evt_imp_001',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.recorded).toBe(true);
      expect(res.body.data.costPiastres).toBe(50);
      expect(res.body.data.campaignStatus).toBe('active');
    });

    it('AC-E19.2 Idempotency: duplicate delivery event with same idempotencyKey does not double-charge', async () => {
      const res = await request(app)
        .post('/api/v1/advertising/events')
        .send({
          campaignId: cappedCampaignId,
          eventType: 'impression',
          placementContext: 'search_services',
          idempotencyKey: 'evt_imp_001', // Repeat same key
        });

      expect(res.status).toBe(200);
      expect(res.body.data.recorded).toBe(true);
      expect(res.body.data.costPiastres).toBe(50);

      // Verify spend is still 50, not 100!
      const metrics = await advertisingService.getCampaignMetrics(proUserId, cappedCampaignId);
      expect(metrics.spentPiastres).toBe(50);
      expect(metrics.impressionsCount).toBe(1);
    });

    it('AC-E19.2 Budget Cap: campaign stops and automatically transitions to completed when budget is exhausted', async () => {
      // Click costs 150. Current spend = 50. 50 + 150 = 200 (exact budget cap!)
      const clickRes = await request(app)
        .post('/api/v1/advertising/events')
        .send({
          campaignId: cappedCampaignId,
          eventType: 'click',
          placementContext: 'search_services',
          idempotencyKey: 'evt_clk_001',
        });

      expect(clickRes.status).toBe(200);
      expect(clickRes.body.data.recorded).toBe(true);
      expect(clickRes.body.data.campaignStatus).toBe('completed');

      // Now spend = 200, budget = 200. Any subsequent impression must be rejected and NOT recorded!
      const overBudgetRes = await request(app)
        .post('/api/v1/advertising/events')
        .send({
          campaignId: cappedCampaignId,
          eventType: 'impression',
          placementContext: 'search_services',
          idempotencyKey: 'evt_imp_002',
        });

      expect(overBudgetRes.status).toBe(200);
      expect(overBudgetRes.body.data.recorded).toBe(false);
      expect(overBudgetRes.body.data.costPiastres).toBe(0);
      expect(overBudgetRes.body.data.campaignStatus).toBe('completed');
    });

    it('should compute accurate campaign metrics (CTR, impressions, clicks, remaining budget)', async () => {
      const res = await request(app)
        .get(`/api/v1/advertising/campaigns/${cappedCampaignId}/metrics`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.impressionsCount).toBe(1);
      expect(res.body.data.clicksCount).toBe(1);
      expect(res.body.data.clickThroughRatePercent).toBe(100); // 1 click / 1 impression = 100%
      expect(res.body.data.spentPiastres).toBe(200);
      expect(res.body.data.remainingBudgetPiastres).toBe(0);
      expect(res.body.data.isBudgetExhausted).toBe(true);
    });

    it('should list advertiser campaigns and admin campaigns', async () => {
      const advertiserRes = await request(app)
        .get('/api/v1/advertising/campaigns')
        .set('Authorization', `Bearer ${proToken}`);

      expect(advertiserRes.status).toBe(200);
      expect(advertiserRes.body.data.length).toBeGreaterThanOrEqual(1);

      const adminRes = await request(app)
        .get('/api/v1/admin/advertising/campaigns')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});

