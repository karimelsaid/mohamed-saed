import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';
import { connectMongo, closeMongo, getDb } from '../../../src/platform/database/connection.js';
import { geographyService } from '../../../src/modules/geography/geography.service.js';
import type { Express } from 'express';

let app: Express;
let config: AppConfig;

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e04_geo',
    MONGODB_DB_NAME: 'mihnati_test_e04_geo',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  // Clean collections
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('governorates').deleteMany({});
  await db.collection('localities').deleteMany({});
  await db.collection('addresses').deleteMany({});

  // Seed geography data
  await geographyService.seedIfEmpty();

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E04 Geography & Addresses API', () => {
  let accessToken: string;
  let governorateId: string;
  let localityId: string;
  let addressId: string;

  beforeAll(async () => {
    // Register and login a user
    await request(app).post('/api/v1/auth/register').send({
      phone: '01055500001',
      password: 'Password123!',
      name: 'مستخدم اختبار الجغرافيا',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      phone: '01055500001',
      password: 'Password123!',
    });
    accessToken = loginRes.body.data.accessToken;
  });

  describe('Public Geography Catalog (AC-E04.1)', () => {
    it('should list all 27 Egyptian governorates', async () => {
      const res = await request(app).get('/api/v1/geography/governorates');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(27);

      // Check Cairo exists
      const cairo = res.body.data.find((g: { code: string }) => g.code === 'CAI');
      expect(cairo).toBeDefined();
      expect(cairo.nameAr).toBe('القاهرة');
      expect(cairo.nameEn).toBe('Cairo');
      governorateId = cairo._id;
    });

    it('should list localities for a governorate (Cairo districts)', async () => {
      const res = await request(app).get(
        `/api/v1/geography/governorates/${governorateId}/localities`
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);

      const nasrCity = res.body.data.find(
        (l: { nameEn: string }) => l.nameEn === 'Nasr City'
      );
      expect(nasrCity).toBeDefined();
      localityId = nasrCity._id;
    });

    it('should return empty array for governorate with no seeded localities', async () => {
      // Get a governorate without seeded localities (e.g. Luxor)
      const govRes = await request(app).get('/api/v1/geography/governorates');
      const luxor = govRes.body.data.find((g: { code: string }) => g.code === 'LX');

      const res = await request(app).get(
        `/api/v1/geography/governorates/${luxor._id}/localities`
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Address Management — manual Egyptian addresses (AC-E04.1)', () => {
    it('should create an address without GPS (manual entry)', async () => {
      const res = await request(app)
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          governorateId,
          localityId,
          exactAddressText: 'شارع عباس العقاد، عمارة 15، مدينة نصر',
          buildingNumber: '15',
          floor: '3',
          apartment: '7',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.governorateId).toBe(governorateId);
      expect(res.body.data.localityId).toBe(localityId);
      expect(res.body.data.exactAddressText).toBe(
        'شارع عباس العقاد، عمارة 15، مدينة نصر'
      );
      expect(res.body.data.isDefault).toBe(true); // First address is auto-default
      expect(res.body.data.approximateLocation.governorate).toBe('القاهرة');
      expect(res.body.data.approximateLocation.locality).toBeDefined();
      addressId = res.body.data.id;
    });

    it('should create a second address and keep first as default', async () => {
      const govRes = await request(app).get('/api/v1/geography/governorates');
      const giza = govRes.body.data.find((g: { code: string }) => g.code === 'GZ');
      const locRes = await request(app).get(
        `/api/v1/geography/governorates/${giza._id}/localities`
      );
      const dokki = locRes.body.data.find(
        (l: { nameEn: string }) => l.nameEn === 'Dokki'
      );

      const res = await request(app)
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          governorateId: giza._id,
          localityId: dokki._id,
          exactAddressText: 'شارع التحرير، الدقي',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isDefault).toBe(false); // Second address is not default
    });

    it('should list all user addresses', async () => {
      const res = await request(app)
        .get('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      // Default should be first
      expect(res.body.data[0].isDefault).toBe(true);
    });

    it('should update an address', async () => {
      const res = await request(app)
        .patch(`/api/v1/me/addresses/${addressId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          floor: '5',
          apartment: '10',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.floor).toBe('5');
      expect(res.body.data.apartment).toBe('10');
    });

    it('should set an address as default', async () => {
      // Get the second address
      const listRes = await request(app)
        .get('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`);
      const secondAddressId = listRes.body.data[1].id;

      const res = await request(app)
        .post(`/api/v1/me/addresses/${secondAddressId}/default`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isDefault).toBe(true);

      // Verify old default is now false
      const listAfter = await request(app)
        .get('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`);
      const oldDefault = listAfter.body.data.find(
        (a: { id: string }) => a.id === addressId
      );
      expect(oldDefault.isDefault).toBe(false);
    });

    it('should delete an address and promote another to default', async () => {
      const listBefore = await request(app)
        .get('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`);
      const defaultAddr = listBefore.body.data.find(
        (a: { isDefault: boolean }) => a.isDefault
      );

      const res = await request(app)
        .delete(`/api/v1/me/addresses/${defaultAddr.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);

      const listAfter = await request(app)
        .get('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(listAfter.body.data.length).toBe(1);
      expect(listAfter.body.data[0].isDefault).toBe(true);
    });

    it('should reject address with invalid governorate', async () => {
      const res = await request(app)
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          governorateId: 'invalid-uuid',
          localityId: localityId,
          exactAddressText: 'عنوان تجريبي',
        });

      expect(res.status).toBe(400);
    });

    it('should reject address with locality from wrong governorate', async () => {
      // Cairo locality with Giza governorate
      const govRes = await request(app).get('/api/v1/geography/governorates');
      const giza = govRes.body.data.find((g: { code: string }) => g.code === 'GZ');

      const res = await request(app)
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          governorateId: giza._id,
          localityId: localityId, // Cairo locality
          exactAddressText: 'عنوان خاطئ',
        });

      expect(res.status).toBe(400);
    });

    it('should require authentication for address endpoints', async () => {
      const res = await request(app).get('/api/v1/me/addresses');
      expect(res.status).toBe(401);
    });
  });

  describe('Approximate Location (AC-E04.3 / AC-E04.4)', () => {
    it('should include approximate location but hide coordinates in address DTO', async () => {
      // Create address with coordinates
      const res = await request(app)
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          governorateId,
          localityId,
          exactAddressText: 'شارع الثورة، مدينة نصر',
          coordinates: {
            latitude: 30.0626,
            longitude: 31.3363,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.approximateLocation).toBeDefined();
      expect(res.body.data.approximateLocation.governorate).toBe('القاهرة');
      // Coordinates should NOT be in the DTO (not exposed publicly)
      expect(res.body.data.coordinates).toBeUndefined();
    });
  });

  describe('Address IDOR Prevention', () => {
    it('should prevent accessing another user\'s address', async () => {
      // Register a second user
      await request(app).post('/api/v1/auth/register').send({
        phone: '01055500002',
        password: 'Password123!',
        name: 'مستخدم آخر',
      });
      const login2 = await request(app).post('/api/v1/auth/login').send({
        phone: '01055500002',
        password: 'Password123!',
      });
      const token2 = login2.body.data.accessToken;

      // Get first user's address list
      const listRes = await request(app)
        .get('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`);
      const addr = listRes.body.data[0];

      // Second user tries to update first user's address
      const res = await request(app)
        .patch(`/api/v1/me/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ floor: 'hacked' });

      expect(res.status).toBe(403);
    });
  });
});

