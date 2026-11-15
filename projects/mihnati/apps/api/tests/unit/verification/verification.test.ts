import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e05_verif',
    MONGODB_DB_NAME: 'mihnati_test_e05_verif',
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
  await db.collection('portfolio_items').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E05 Professional Profiles & Verification API', () => {
  let adminToken: string;
  let adminId: string;
  let proToken: string;
  let proUserId: string;
  let caseId: string;
  let proSlug = 'ahmed-plumber-cairo';

  beforeAll(async () => {
    // 1. Create admin user
    const adminReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880001',
      password: 'AdminPassword123!',
      name: 'مسؤول التوثيق',
    });
    adminId = adminReg.body.data.id;

    const db = getDb();
    await db.collection('user_role_assignments').insertOne({
      _id: 'test-admin-verif-assign',
      userId: adminId,
      roleKey: 'admin',
      status: 'active',
      grantedAt: new Date(),
    });

    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880001',
      password: 'AdminPassword123!',
    });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Create professional applicant
    const proReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01088880002',
      password: 'ProPassword123!',
      name: 'أحمد محمود السباك',
    });
    proUserId = proReg.body.data.id;

    const proLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01088880002',
      password: 'ProPassword123!',
    });
    proToken = proLogin.body.data.accessToken;

    // Activate professional role
    await request(app)
      .post('/api/v1/me/roles/professional/activate')
      .set('Authorization', `Bearer ${proToken}`);

    // Update professional profile with slug & title
    await request(app)
      .patch('/api/v1/profiles/professional/me')
      .set('Authorization', `Bearer ${proToken}`)
      .send({
        title: 'فني سباكة وتدفئة معتمد',
        bio: 'خبرة أكثر من 10 سنوات في تأسيس وصيانة شبكات المياه والصرف',
        slug: proSlug,
        specialties: ['سباكة عامة', 'سخانات غاز'],
        publicApproxLocation: {
          governorate: 'القاهرة',
          locality: 'مدينة نصر',
        },
      });
  });

  describe('Verification Case Submission Flow (AC-E05.2)', () => {
    it('should create initial draft verification case', async () => {
      const res = await request(app)
        .post('/api/v1/verification-cases')
        .set('Authorization', `Bearer ${proToken}`)
        .send({ profileType: 'professional' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.documents).toEqual([]);
      caseId = res.body.data._id;
    });

    it('should reject submission without required National ID documents', async () => {
      const res = await request(app)
        .post(`/api/v1/verification-cases/${caseId}/submit`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ applicantNotes: 'يرجى مراجعة طلبي' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should upload National ID front and back documents', async () => {
      // 1. Front ID
      const frontRes = await request(app)
        .post(`/api/v1/verification-cases/${caseId}/documents`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          type: 'national_id_front',
          fileKey: 'uploads/verif/front_id_123.jpg',
          fileName: 'front_id.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 154200,
        });

      expect(frontRes.status).toBe(200);
      expect(frontRes.body.data.documents.length).toBe(1);

      // 2. Back ID
      const backRes = await request(app)
        .post(`/api/v1/verification-cases/${caseId}/documents`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          type: 'national_id_back',
          fileKey: 'uploads/verif/back_id_123.jpg',
          fileName: 'back_id.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 148100,
        });

      expect(backRes.status).toBe(200);
      expect(backRes.body.data.documents.length).toBe(2);
    });

    it('should submit verification case successfully for review', async () => {
      const res = await request(app)
        .post(`/api/v1/verification-cases/${caseId}/submit`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ applicantNotes: 'تم إرفاق صورة بطاقة الرقم القومي سارية' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending_review');

      // Check that profile verificationStatus is also updated to pending_review
      const proProfileRes = await request(app)
        .get('/api/v1/profiles/professional/me')
        .set('Authorization', `Bearer ${proToken}`);

      expect(proProfileRes.body.data.verificationStatus).toBe('pending_review');
    });

    it('should prevent uploading new documents once submitted to review', async () => {
      const res = await request(app)
        .post(`/api/v1/verification-cases/${caseId}/documents`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          type: 'criminal_record',
          fileKey: 'uploads/verif/fish_123.jpg',
          fileName: 'fish.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 120000,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Admin Review Queue & Reviewer Actions (AC-E05.2)', () => {
    it('should forbid unprivileged users from accessing admin review queue', async () => {
      const res = await request(app)
        .get('/api/v1/admin/verification-cases')
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admin reviewer to list cases and get details with audit', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/verification-cases?status=pending_review')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toBeInstanceOf(Array);
      expect(listRes.body.data.length).toBeGreaterThan(0);

      // Get case details
      const getRes = await request(app)
        .get(`/api/v1/admin/verification-cases/${caseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data._id).toBe(caseId);

      // Verify sensitive read was logged to admin_audit_logs
      const db = getDb();
      const auditLog = await db.collection('admin_audit_logs').findOne({
        targetId: caseId,
        action: 'verification:read',
      });
      expect(auditLog).toBeDefined();
    });

    it('should prevent reviewer from deciding their own case (Separation of Duties)', async () => {
      // Simulate admin trying to decide a case owned by themselves
      const db = getDb();
      await db.collection('verification_cases').updateOne(
        { _id: caseId },
        { $set: { userId: adminId } }
      );

      const res = await request(app)
        .post(`/api/v1/admin/verification-cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'verified',
          reviewerDecisionNotes: 'اعتماد ذاتي غير مسموح',
        });

      expect(res.status).toBe(403);

      // Restore owner
      await db.collection('verification_cases').updateOne(
        { _id: caseId },
        { $set: { userId: proUserId } }
      );
    });

    it('should allow admin reviewer to approve case (verified)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/verification-cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'verified',
          reviewerDecisionNotes: 'تمت مطابقة صورة البطاقة وصحتها بنجاح',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('verified');
      expect(res.body.data.decidedBy).toBe(adminId);

      // Verify professional profile is now verified
      const proProfileRes = await request(app)
        .get('/api/v1/profiles/professional/me')
        .set('Authorization', `Bearer ${proToken}`);

      expect(proProfileRes.body.data.verificationStatus).toBe('verified');

      // Verify audit decision was logged
      const db = getDb();
      const auditDecision = await db.collection('admin_audit_logs').findOne({
        targetId: caseId,
        action: 'verification:decide:verified',
      });
      expect(auditDecision).toBeDefined();
    });
  });

  describe('Portfolio Management (AC-E05.1)', () => {
    let portfolioItemId: string;

    it('should add portfolio item with attachments', async () => {
      const res = await request(app)
        .post('/api/v1/profiles/professional/me/portfolio')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          title: 'تشطيب سباكة فيلا بالتجمع الخامس',
          description: 'تنفيذ شبكة التغذية والصرف بالكامل باستخدام أنابيب بولي بروبلين ألمانية',
          attachments: [
            {
              fileKey: 'uploads/portfolio/job1.jpg',
              fileName: 'job1.jpg',
              mimeType: 'image/jpeg',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('تشطيب سباكة فيلا بالتجمع الخامس');
      portfolioItemId = res.body.data.id;
    });

    it('should list professional portfolio items', async () => {
      const res = await request(app)
        .get('/api/v1/profiles/professional/me/portfolio')
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(portfolioItemId);
    });

    it('should delete portfolio item', async () => {
      const res = await request(app)
        .delete(`/api/v1/profiles/professional/me/portfolio/${portfolioItemId}`)
        .set('Authorization', `Bearer ${proToken}`);

      expect(res.status).toBe(200);

      const listAfter = await request(app)
        .get('/api/v1/profiles/professional/me/portfolio')
        .set('Authorization', `Bearer ${proToken}`);

      expect(listAfter.body.data.length).toBe(0);
    });
  });

  describe('Public Profile Projection Allowlist (AC-E05.1)', () => {
    it('should return public profile without exposing private fields', async () => {
      // Re-add one portfolio item
      await request(app)
        .post('/api/v1/profiles/professional/me/portfolio')
        .set('Authorization', `Bearer ${proToken}`)
        .send({
          title: 'صيانة شبكة الصرف',
          description: 'أعمال تسليك واستبدال محابس',
        });

      const res = await request(app).get(`/api/v1/professionals/${proSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe(proSlug);
      expect(res.body.data.title).toBe('فني سباكة وتدفئة معتمد');
      expect(res.body.data.verificationStatus).toBe('verified');
      expect(res.body.data.publicApproxLocation.governorate).toBe('القاهرة');
      expect(res.body.data.portfolio.length).toBe(1);

      // Security check: Private fields MUST be absent from public output
      expect(res.body.data.phone).toBeUndefined();
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.exactAddressText).toBeUndefined();
      expect(res.body.data.documents).toBeUndefined();
    });
  });
});
