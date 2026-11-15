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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e03',
    MONGODB_DB_NAME: 'mihnati_test_e03',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('customer_profiles').deleteMany({});
  await db.collection('professional_profiles').deleteMany({});
  await db.collection('merchant_profiles').deleteMany({});

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E03 Multi-Role Accounts & Profiles API', () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    // Register and login a single user
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '01012349999',
        password: 'Password123!',
        name: 'يوسف كريم',
      });
    userId = regRes.body.data.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        phone: '01012349999',
        password: 'Password123!',
      });
    accessToken = loginRes.body.data.accessToken;
  });

  describe('Role Activation (AC-E03.1 & AC-E03.2)', () => {
    it('should activate Customer role and create customer profile', async () => {
      const res = await request(app)
        .post('/api/v1/me/roles/customer/activate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.roleKey).toBe('customer');
      expect(res.body.data.status).toBe('active');
    });

    it('should activate Professional role and create draft professional profile', async () => {
      const res = await request(app)
        .post('/api/v1/me/roles/professional/activate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.roleKey).toBe('professional');
      expect(res.body.data.status).toBe('active');
    });

    it('should activate Merchant role and create draft merchant profile', async () => {
      const res = await request(app)
        .post('/api/v1/me/roles/merchant/activate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.roleKey).toBe('merchant');
      expect(res.body.data.status).toBe('active');
    });

    it('should list all 3 active market roles under the same user identity (AC-E03.1)', async () => {
      const res = await request(app)
        .get('/api/v1/me/roles')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      const roleKeys = res.body.data.map((r: { roleKey: string }) => r.roleKey);
      expect(roleKeys).toContain('customer');
      expect(roleKeys).toContain('professional');
      expect(roleKeys).toContain('merchant');
    });

    it('should not duplicate assignments or profiles on repeated activation (AC-E03.2)', async () => {
      // Re-activate customer
      const res = await request(app)
        .post('/api/v1/me/roles/customer/activate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.roleKey).toBe('customer');

      // Check DB directly: still exactly 1 customer profile and 1 customer assignment
      const db = getDb();
      const assignments = await db
        .collection('user_role_assignments')
        .find({ userId, roleKey: 'customer' })
        .toArray();
      const profiles = await db
        .collection('customer_profiles')
        .find({ userId })
        .toArray();

      expect(assignments).toHaveLength(1);
      expect(profiles).toHaveLength(1);
    });

    it('should forbid self-activating internal admin roles', async () => {
      const res = await request(app)
        .post('/api/v1/me/roles/admin/activate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should deactivate a role', async () => {
      const res = await request(app)
        .post('/api/v1/me/roles/merchant/deactivate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Paused store' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('inactive');
    });
  });

  describe('Role-Specific Profiles (E03-T02)', () => {
    it('should read and update Customer profile', async () => {
      const getRes = await request(app)
        .get('/api/v1/profiles/customer/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.userId).toBe(userId);

      const patchRes = await request(app)
        .patch('/api/v1/profiles/customer/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ notes: 'توصيل في الفترة الصباحية فقط' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.notes).toBe('توصيل في الفترة الصباحية فقط');
    });

    it('should read and update Professional profile', async () => {
      const getRes = await request(app)
        .get('/api/v1/profiles/professional/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.verificationStatus).toBe('draft');

      const patchRes = await request(app)
        .patch('/api/v1/profiles/professional/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'كهربائي منازل معتمد',
          bio: 'خبرة 10 سنوات في صيانة وتأسيس الكهرباء',
          specialties: ['صيانة لوحات', 'تمديد أسلاك'],
          slug: 'pro-youssef-electrician',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.title).toBe('كهربائي منازل معتمد');
      expect(patchRes.body.data.slug).toBe('pro-youssef-electrician');
    });

    it('should reject duplicate professional slug from another user', async () => {
      // Create second user
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          phone: '01055554444',
          password: 'Password123!',
          name: 'فني ثان',
        });
      const login2 = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '01055554444', password: 'Password123!' });

      await request(app)
        .post('/api/v1/me/roles/professional/activate')
        .set('Authorization', `Bearer ${login2.body.data.accessToken}`);

      // Try setting same slug
      const clashRes = await request(app)
        .patch('/api/v1/profiles/professional/me')
        .set('Authorization', `Bearer ${login2.body.data.accessToken}`)
        .send({ slug: 'pro-youssef-electrician' });

      expect(clashRes.status).toBe(409);
      expect(clashRes.body.error.code).toBe('CONFLICT');
    });

    it('should read and update Merchant profile', async () => {
      const getRes = await request(app)
        .get('/api/v1/profiles/merchant/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.userId).toBe(userId);

      const patchRes = await request(app)
        .patch('/api/v1/profiles/merchant/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          businessName: 'متجر الأدوات الكهربائية الحديثة',
          commercialRegistrationNumber: 'CR-12345678',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.businessName).toBe('متجر الأدوات الكهربائية الحديثة');
    });
  });
});

