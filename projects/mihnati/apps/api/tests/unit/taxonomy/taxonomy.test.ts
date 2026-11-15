import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { taxonomyService } from '../../../src/modules/taxonomy/taxonomy.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e04_tax',
    MONGODB_DB_NAME: 'mihnati_test_e04_tax',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('categories').deleteMany({});
  await db.collection('specialties').deleteMany({});

  await taxonomyService.seedIfEmpty();

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E04 Taxonomy (Categories & Specialties) API', () => {
  let adminToken: string;
  let userToken: string;
  let createdCategoryId: string;

  beforeAll(async () => {
    // 1. Create admin user
    const adminReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01099990001',
      password: 'AdminPassword123!',
      name: 'مدير النظام',
    });
    const adminId = adminReg.body.data.id;

    // Assign admin role to user in DB
    const db = getDb();
    await db.collection('user_role_assignments').insertOne({
      _id: 'test-admin-assignment-1',
      userId: adminId,
      roleKey: 'admin',
      status: 'active',
      grantedAt: new Date(),
    });

    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01099990001',
      password: 'AdminPassword123!',
    });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Create normal user
    await request(app).post('/api/v1/auth/register').send({
      phone: '01099990002',
      password: 'UserPassword123!',
      name: 'مستخدم عادي',
    });
    const userLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01099990002',
      password: 'UserPassword123!',
    });
    userToken = userLogin.body.data.accessToken;
  });

  describe('Public Categories & Specialties (AC-E04.2)', () => {
    it('should list active service categories', async () => {
      const res = await request(app).get('/api/v1/categories?type=service');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);

      const homeMaintenance = res.body.data.find(
        (c: { slug: string }) => c.slug === 'home-maintenance'
      );
      expect(homeMaintenance).toBeDefined();
      expect(homeMaintenance.nameAr).toBe('صيانة منزلية');
    });

    it('should return category tree when requested', async () => {
      const res = await request(app).get('/api/v1/categories?type=service&tree=true');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.every((c: { parentId: string | null }) => c.parentId === null)).toBe(true);
    });
  });

  describe('Admin Categories Management & RBAC (AC-E04.2)', () => {
    it('should forbid normal user from creating category (RBAC)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'service',
          nameAr: 'سباكة',
          nameEn: 'Plumbing',
        });

      expect(res.status).toBe(403);
    });

    it('should allow admin to create a root category', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'service',
          nameAr: 'سباكة وأعمال صحية',
          nameEn: 'Plumbing & Sanitary',
          descriptionAr: 'خدمات السباكة المتكاملة',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.slug).toBe('plumbing-sanitary');
      expect(res.body.data.depth).toBe(0);
      createdCategoryId = res.body.data.id;
    });

    it('should allow admin to create child category (sub-category)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'service',
          parentId: createdCategoryId,
          nameAr: 'تركيب وصيانة السخانات',
          nameEn: 'Water Heater Installation',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.parentId).toBe(createdCategoryId);
      expect(res.body.data.depth).toBe(1);
    });

    it('should reject category slug collision under same parent', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'service',
          parentId: createdCategoryId,
          nameAr: 'تركيب سخانات مكرر',
          nameEn: 'Water Heater Installation', // same English slug
        });

      expect(res.status).toBe(409);
    });

    it('should update category status and details', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          descriptionAr: 'وصف محدث للسباكة',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.descriptionAr).toBe('وصف محدث للسباكة');
    });
  });

  describe('Specialties Management (AC-E04.2)', () => {
    let specialtyId: string;

    it('should create specialty under category by admin', async () => {
      const res = await request(app)
        .post('/api/v1/admin/specialties')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: createdCategoryId,
          nameAr: 'صيانة سخانات الغاز',
          nameEn: 'Gas Heaters Maintenance',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.categoryId).toBe(createdCategoryId);
      expect(res.body.data.slug).toBe('gas-heaters-maintenance');
      specialtyId = res.body.data.id;
    });

    it('should reject duplicate specialty slug in same category', async () => {
      const res = await request(app)
        .post('/api/v1/admin/specialties')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: createdCategoryId,
          nameAr: 'صيانة غاز مكررة',
          nameEn: 'Gas Heaters Maintenance',
        });

      expect(res.status).toBe(409);
    });

    it('should list specialties for category', async () => {
      const res = await request(app).get(`/api/v1/specialties?categoryId=${createdCategoryId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(specialtyId);
    });
  });
});

