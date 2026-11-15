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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e16_disputes',
    MONGODB_DB_NAME: 'mihnati_test_e16_disputes',
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
  await db.collection('support_tickets').deleteMany({});
  await db.collection('support_messages').deleteMany({});
  await db.collection('reports').deleteMany({});
  await db.collection('disputes').deleteMany({});
  await db.collection('return_requests').deleteMany({});
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

describe('E16 Complaints, Disputes & Return Requests', () => {
  let customerToken: string;
  let customerId: string;
  let otherCustomerToken: string;
  let proToken: string;
  let proId: string;
  let merchantToken: string;
  let merchantId: string;
  let staff1Token: string;
  let staff1Id: string;
  let staff2Token: string;
  let staff2Id: string;

  let serviceOrderId: string;
  let merchantOrderId: string;
  let storeId: string;
  let productId: string;

  let ticketId: string;
  let reportId: string;
  let disputeId: string;
  let returnRequestId: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Geography & Category
    const govs = await geographyService.listGovernorates();
    const cairoGovId = govs.find((g) => g.code === 'CAI')!._id;
    const cats = await taxonomyService.listCategories({ type: 'product' });
    const productCatId = cats[0].id;

    // 2. Customer
    const custRes = await request(app).post('/api/v1/auth/register').send({
      phone: '01066661111',
      password: 'CustomerPass123!',
      name: 'أحمد محمود العميل',
    });
    customerId = custRes.body.data.id;
    const custLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01066661111',
      password: 'CustomerPass123!',
    });
    customerToken = custLogin.body.data.accessToken;

    // 3. Other Customer
    const otherRes = await request(app).post('/api/v1/auth/register').send({
      phone: '01066662222',
      password: 'CustomerPass123!',
      name: 'مستخدم آخر',
    });
    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01066662222',
      password: 'CustomerPass123!',
    });
    otherCustomerToken = otherLogin.body.data.accessToken;

    // 4. Professional
    const proRes = await request(app).post('/api/v1/auth/register').send({
      phone: '01066663333',
      password: 'ProPass123!',
      name: 'أسامة فني السباكة',
    });
    proId = proRes.body.data.id;
    const proLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01066663333',
      password: 'ProPass123!',
    });
    proToken = proLogin.body.data.accessToken;
    await request(app).post('/api/v1/me/roles/professional/activate').set('Authorization', `Bearer ${proToken}`);

    // 5. Merchant
    const mRes = await request(app).post('/api/v1/auth/register').send({
      phone: '01066664444',
      password: 'MerchantPass123!',
      name: 'متجر الأدوات الصحية',
    });
    merchantId = mRes.body.data.id;
    const mLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01066664444',
      password: 'MerchantPass123!',
    });
    merchantToken = mLogin.body.data.accessToken;
    await request(app).post('/api/v1/me/roles/merchant/activate').set('Authorization', `Bearer ${merchantToken}`);
    await db.collection('merchant_profiles').updateOne(
      { userId: merchantId },
      { $set: { verificationStatus: 'verified' } }
    );

    // Create approved store for merchant
    const storeRes = await request(app)
      .post('/api/v1/stores/me')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        nameAr: 'متجر النيل للأدوات الصحية',
        nameEn: 'Nile Sanitary Store',
        slug: 'nile-sanitary-store',
        governorateId: cairoGovId,
        categories: [productCatId],
      });
    storeId = storeRes.body.data.id;
    await db.collection('stores').updateOne({ _id: storeId }, { $set: { status: 'active' } });

    // Create product
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        titleAr: 'خلاط مياه نحاسي فاخر',
        titleEn: 'Brass Water Mixer',
        slug: 'brass-water-mixer',
        categoryId: productCatId,
        sku: 'MIX-BRASS-01',
        price: 75000,
        stockQuantity: 10,
      });
    productId = prodRes.body.data.id;
    await db.collection('products').updateOne({ _id: productId }, { $set: { status: 'active', onHand: 10 } });

    // 6. Staff Reviewer 1 (Support role)
    const staff1Res = await request(app).post('/api/v1/auth/register').send({
      phone: '01066665555',
      password: 'StaffPass123!',
      name: 'مسؤول الدعم الأول',
    });
    staff1Id = staff1Res.body.data.id;
    const s1Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01066665555',
      password: 'StaffPass123!',
    });
    staff1Token = s1Login.body.data.accessToken;
    await db.collection('user_role_assignments').insertOne({
      _id: 'assign-staff-1',
      userId: staff1Id,
      roleKey: 'support',
      status: 'active',
      grantedAt: new Date(),
    } as any);

    // 7. Staff Reviewer 2 (Admin role, for SoD appeal testing)
    const staff2Res = await request(app).post('/api/v1/auth/register').send({
      phone: '01066666666',
      password: 'AdminPass123!',
      name: 'مسؤول المراجعة والقرارات الثاني',
    });
    staff2Id = staff2Res.body.data.id;
    const s2Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01066666666',
      password: 'AdminPass123!',
    });
    staff2Token = s2Login.body.data.accessToken;
    await db.collection('user_role_assignments').insertOne({
      _id: 'assign-staff-2',
      userId: staff2Id,
      roleKey: 'admin',
      status: 'active',
      grantedAt: new Date(),
    } as any);

    // 8. Seed ServiceOrder
    serviceOrderId = 'order-srv-dispute-test';
    await db.collection('service_orders').insertOne({
      _id: serviceOrderId,
      serviceRequestId: 'req-srv-test',
      offerId: 'offer-srv-test',
      customerId,
      professionalProfileId: 'pro-prof-test',
      professionalUserId: proId,
      pricePiastres: 25000,
      status: 'in_progress',
      scopeSummary: 'تركيب وصيانة خلاط السباكة',
      addressConsentGranted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // 9. Seed MerchantOrder (delivered)
    merchantOrderId = 'order-merch-return-test';
    await db.collection('merchant_orders').insertOne({
      _id: merchantOrderId,
      orderNumber: 'ORD-RET-001',
      storeId,
      merchantUserId: merchantId,
      customerId,
      status: 'delivered',
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'pending',
      items: [
        {
          productId,
          titleAr: 'خلاط مياه نحاسي فاخر',
          titleEn: 'Brass Water Mixer',
          sku: 'MIX-BRASS-01',
          unitPricePiastres: 75000,
          quantity: 2,
          totalPiastres: 150000,
        },
      ],
      totalPiastres: 150000,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. Support Tickets & Messaging (E16-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('1. Support Tickets & Messaging (E16-T01)', () => {
    it('creates a new support ticket and returns 201 with ticketNumber and open status', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          subject: 'استفسار بخصوص موعد الخدمة',
          category: 'service',
          priority: 'medium',
          message: 'أريد معرفة كيفية تأكيد الموعد مع الفني عبر المنصة.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.ticketNumber).toMatch(/^TCK-/);
      expect(res.body.data.status).toBe('open');
      expect(res.body.data.subject).toBe('استفسار بخصوص موعد الخدمة');
      ticketId = res.body.data.id;
    });

    it('customer retrieves their own support tickets', async () => {
      const res = await request(app)
        .get('/api/v1/support/tickets/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((t: any) => t.id === ticketId)).toBe(true);
    });

    it('customer can get ticket by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ticketId);
    });

    it('another customer cannot access ticket (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(403);
    });

    it('customer adds a support message to their ticket', async () => {
      const res = await request(app)
        .post(`/api/v1/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          message: 'أيضاً هل يمكن تغيير العنوان إذا لزم الأمر؟',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.senderRole).toBe('user');
      expect(res.body.data.message).toBe('أيضاً هل يمكن تغيير العنوان إذا لزم الأمر؟');
    });

    it('support staff lists tickets with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/support/tickets?page=1&pageSize=10')
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('support staff assigns ticket to themselves', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/support/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          assignedStaffId: staff1Id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedStaffId).toBe(staff1Id);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('support staff posts response message, changing ticket status to waiting_user', async () => {
      const res = await request(app)
        .post(`/api/v1/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          message: 'أهلاً بك، يمكنك تعديل العنوان عبر شاشة تفاصيل الطلب قبل الموعد.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.senderRole).toBe('staff');

      const ticketCheck = await request(app)
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${staff1Token}`);
      expect(ticketCheck.body.data.status).toBe('waiting_user');
    });

    it('lists all messages for the ticket', async () => {
      const res = await request(app)
        .get(`/api/v1/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3); // Initial message + customer follow-up + staff reply
    });

    it('support staff updates ticket status to resolved', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/support/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          status: 'resolved',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.closedAt).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Content & User Reports (E16-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('2. Content & User Reports (E16-T01)', () => {
    it('customer submits a report for a product', async () => {
      const res = await request(app)
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          targetType: 'product',
          targetId: productId,
          reason: 'وصف المنتج مضلل بخصوص بلد المنشأ',
          details: 'المنتج مكتوب عليه مصري وهو مستورد.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('pending');
      reportId = res.body.data.id;
    });

    it('support staff lists reports', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports?status=pending')
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((r: any) => r.id === reportId)).toBe(true);
    });

    it('support staff resolves the report', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/reports/${reportId}/resolve`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          status: 'actioned',
          resolutionReason: 'تم مراجعة الفاتورة وتعديل وصف المنتج بواسطة التاجر',
          actionTaken: 'تعديل البيانات وتحذير التاجر',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('actioned');
      expect(res.body.data.resolutionReason).toBe('تم مراجعة الفاتورة وتعديل وصف المنتج بواسطة التاجر');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Formal Order Disputes Lifecycle & Outcomes (E16-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('3. Formal Order Disputes Lifecycle & Outcomes (E16-T02)', () => {
    it('non-participant cannot open dispute on ServiceOrder (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({
          subjectType: 'service_order',
          subjectId: serviceOrderId,
          reason: 'محاولة فتح نزاع من طرف غير مصرح له',
        });

      expect(res.status).toBe(403);
    });

    it('customer opens formal dispute on ServiceOrder, transitioning order to disputed', async () => {
      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          subjectType: 'service_order',
          subjectId: serviceOrderId,
          reason: 'الفني لم يكمل أعمال السباكة المتفق عليها وانصرف مبكراً.',
          initialEvidenceDescription: 'صور الأعمال غير المكتملة',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.disputeNumber).toMatch(/^DSP-/);
      expect(res.body.data.status).toBe('open');
      expect(res.body.data.evidenceList.length).toBe(1);
      disputeId = res.body.data.id;

      // Check order status was transitioned to 'disputed'
      const db = getDb();
      const order = await db.collection('service_orders').findOne({ _id: serviceOrderId });
      expect(order?.status).toBe('disputed');
    });

    it('rejects duplicate active dispute on same order with 409 DUPLICATE_DISPUTE', async () => {
      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          subjectType: 'service_order',
          subjectId: serviceOrderId,
          reason: 'محاولة فتح نزاع مكرر لنفس الطلب',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_DISPUTE');
    });

    it('dispute participants can list their disputes', async () => {
      const res = await request(app)
        .get('/api/v1/disputes/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((d: any) => d.id === disputeId)).toBe(true);
    });

    it('admin assigns reviewer to dispute, moving status to under_review', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/disputes/${disputeId}/assign`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          reviewerId: staff1Id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedReviewerId).toBe(staff1Id);
      expect(res.body.data.status).toBe('under_review');
    });

    it('reviewer requests evidence with deadline, setting status to awaiting_evidence', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/disputes/${disputeId}/request-evidence`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          description: 'يرجى تقديم محضر إثبات الحالة وصور التركيبات من الطرفين خلال 3 أيام.',
          deadlineDays: 3,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('awaiting_evidence');
      expect(res.body.data.evidenceDeadline).toBeDefined();
    });

    it('professional submits evidence, transitioning dispute back to under_review', async () => {
      const res = await request(app)
        .post(`/api/v1/disputes/${disputeId}/evidence`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          description: 'صورة توضح أن التركيبات تمت بنجاح والعميل رفض التوقيع على الاستلام.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('under_review');
      expect(res.body.data.evidenceList.length).toBe(2);
    });

    it('reviewer issues decision with cancel_service outcome, updating order to cancelled', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/disputes/${disputeId}/decision`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          outcome: 'cancel_service',
          reason: 'ثبت عدم استكمال الخدمة وفق الأصول المهنية، ويتم إلغاء الخدمة دون مستحقات.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('decision_issued');
      expect(res.body.data.initialDecision.outcome).toBe('cancel_service');
      expect(res.body.data.initialDecision.issuedBy).toBe(staff1Id);

      const db = getDb();
      const order = await db.collection('service_orders').findOne({ _id: serviceOrderId });
      expect(order?.status).toBe('cancelled');
    });

    it('professional appeals the decision within appeal window', async () => {
      const res = await request(app)
        .post(`/api/v1/disputes/${disputeId}/appeal`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          reason: 'العميل قام بكسر الماسورة بعد انصرافي، وأرفق تسجيل كاميرات العمارة يثبت الموعد.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('appeal_requested');
      expect(res.body.data.appeal.requestedBy).toBe(proId);
    });

    it('Separation of Duties (SoD): Initial reviewer cannot decide the appeal (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/disputes/${disputeId}/appeal-decision`)
        .set('Authorization', `Bearer ${staff1Token}`)
        .send({
          outcome: 'complete_service',
          reason: 'محاولة غير مسموح بها لمراجعة قراري الخاص',
        });

      expect(res.status).toBe(403);
    });

    it('Second reviewer decides appeal, updating status to resolved and order to completed', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/disputes/${disputeId}/appeal-decision`)
        .set('Authorization', `Bearer ${staff2Token}`)
        .send({
          outcome: 'complete_service',
          reason: 'بعد مراجعة الأدلة الجديدة ومقطع الكاميرات، ثبت إنجاز الفني لكامل التزاماته واعتبرت الخدمة مكتملة.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.finalOutcome).toBe('complete_service');
      expect(res.body.data.appeal.secondReviewerId).toBe(staff2Id);

      const db = getDb();
      const order = await db.collection('service_orders').findOne({ _id: serviceOrderId });
      expect(order?.status).toBe('completed');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 4. Return Requests Lifecycle & Inspection (E16-T03) ──
  // ══════════════════════════════════════════════════════════════

  describe('4. Return Requests Lifecycle & Inspection (E16-T03)', () => {
    it('validates return quantity <= purchased quantity (fails 400 for excessive quantity)', async () => {
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: merchantOrderId,
          items: [
            {
              productId,
              quantity: 5, // Ordered only 2!
              reason: 'الكمية غير مطابقة',
            },
          ],
        });

      expect(res.status).toBe(400);
    });

    it('creates return request on delivered MerchantOrder and returns 201 with requested status', async () => {
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: merchantOrderId,
          items: [
            {
              productId,
              quantity: 1,
              reason: 'المقاس غير متطابق مع وصلات الحوض',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.returnNumber).toMatch(/^RET-/);
      expect(res.body.data.status).toBe('requested');
      returnRequestId = res.body.data.id;
    });

    it('customer retrieves their return requests', async () => {
      const res = await request(app)
        .get('/api/v1/returns/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((r: any) => r.id === returnRequestId)).toBe(true);
    });

    it('merchant retrieves store return requests', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/returns')
        .set('Authorization', `Bearer ${merchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((r: any) => r.id === returnRequestId)).toBe(true);
    });

    it('merchant reviews and approves return request, moving to awaiting_return', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/returns/${returnRequestId}/review`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          approved: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('awaiting_return');
    });

    it('customer marks return as shipped, moving to in_transit', async () => {
      const res = await request(app)
        .post(`/api/v1/returns/${returnRequestId}/ship`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_transit');
    });

    it('merchant marks return as received, moving to inspecting', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/returns/${returnRequestId}/receive`)
        .set('Authorization', `Bearer ${merchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('inspecting');
    });

    it('merchant inspects physical return and accepts it with condition notes', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/returns/${returnRequestId}/inspect`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          conditionNotes: 'القطعة سليمة وفي كرتونتها الأصلية وغير مستخدمة.',
          result: 'accepted',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('accepted');
      expect(res.body.data.merchantInspection.result).toBe('accepted');
    });

    it('merchant resolves return with refund_due and COD cash refund assertion disclaimer', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/returns/${returnRequestId}/resolve`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          resolution: 'refund_due',
          resolutionNotes: 'تم تسليم المبلغ نقداً للعميل عند الاستلام.',
          codRefundAmountPiastres: 75000,
          codRefundMethod: 'cash',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolution).toBe('refund_due');
      expect(res.body.data.codRefundReport).toBeDefined();
      expect(res.body.data.codRefundReport.isAssertion).toBe(true);
      expect(res.body.data.codRefundReport.disclaimer).toContain('merchant-reported COD cash refund assertion');
    });

    it('demonstrates return rejection and customer escalation into a formal dispute', async () => {
      // 1. Create second return request
      const ret2Res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: merchantOrderId,
          items: [
            {
              productId,
              quantity: 1,
              reason: 'عيوب في الطلاء',
            },
          ],
        });
      const ret2Id = ret2Res.body.data.id;

      // 2. Merchant reviews and rejects
      const rejectRes = await request(app)
        .post(`/api/v1/merchant/returns/${ret2Id}/review`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          approved: false,
          reason: 'تم الفحص المسبق والطلاء سليم تماماً قبل الشحن.',
        });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('rejected');

      // 3. Customer escalates rejected return into a formal dispute
      const escRes = await request(app)
        .post(`/api/v1/returns/${ret2Id}/dispute`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reason: 'أرفض قرار التاجر لأن الخدوش واضحة وموثقة بالصور.',
        });

      expect(escRes.status).toBe(201);
      expect(escRes.body.data.id).toBeDefined();
      expect(escRes.body.data.subjectType).toBe('merchant_order');
      expect(escRes.body.data.subjectId).toBe(merchantOrderId);
      expect(escRes.body.data.status).toBe('open');

      // Verify return request now references the dispute
      const retCheck = await request(app)
        .get(`/api/v1/returns/${ret2Id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(retCheck.body.data.disputeId).toBe(escRes.body.data.id);
    });
  });
});
