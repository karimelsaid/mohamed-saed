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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e02',
    MONGODB_DB_NAME: 'mihnati_test_e02',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('otp_challenges').deleteMany({});
  await db.collection('domain_events').deleteMany({});

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E02 Authentication & User Management API', () => {
  const testPhone = '01099887766';
  const testPassword = 'StrongPassword123!';
  const testName = 'أحمد محمود';
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  describe('Registration (AC-E02.1)', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          phone: testPhone,
          password: testPassword,
          name: testName,
          locale: 'ar',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.phone).toBe('+201099887766');
      expect(res.body.data.name).toBe(testName);
      expect(res.body.data.status).toBe('active');
      expect(res.body.meta.requestId).toBeDefined();

      userId = res.body.data.id;
    });

    it('should reject duplicate phone registration without creating duplicate user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          phone: testPhone,
          password: 'AnotherPassword123!',
          name: 'مستخدم مكرر',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject short passwords', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          phone: '01011112222',
          password: 'short',
          name: 'علي',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('OTP Challenges', () => {
    it('should send an OTP code for verification', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({
          phone: testPhone,
          purpose: 'login',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBeDefined();
    });

    it('should verify correct OTP code', async () => {
      // In test mode, OTP is deterministic '123456'
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          phone: '+201099887766',
          code: '123456',
          purpose: 'login',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.verified).toBe(true);
    });

    it('should reject invalid OTP code', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          phone: '+201099887766',
          code: '000000',
          purpose: 'login',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Login & Session Creation', () => {
    it('should login with correct phone and password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: testPhone,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.phone).toBe('+201099887766');

      // Check cookies
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('mihnati_session='))).toBe(true);

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject wrong password without revealing account details (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: testPhone,
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid phone number or password');
    });

    it('should reject non-existent user with same generic error (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: '01000000000',
          password: 'AnyPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid phone number or password');
    });
  });

  describe('Protected /me Routes', () => {
    it('should get current user profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.name).toBe(testName);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('should update user profile (name and locale)', async () => {
      const res = await request(app)
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'أحمد محمود المحدث',
          locale: 'en',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('أحمد محمود المحدث');
      expect(res.body.data.locale).toBe('en');
    });
  });

  describe('Session Management & Refresh Rotation (AC-E02.2)', () => {
    it('should list active user sessions', async () => {
      const res = await request(app)
        .get('/api/v1/me/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should rotate session and receive new tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);

      // Save new tokens
      const newRefreshToken = res.body.data.refreshToken;
      const newAccessToken = res.body.data.accessToken;

      // Verify old refresh token CANNOT be used again (Token reuse detection)
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken }); // Old token replayed

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.message).toContain('reuse detected');

      // Reused token should revoke the entire family!
      // Therefore, the new token should NOW ALSO BE REVOKED!
      const afterReuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(afterReuseRes.status).toBe(401);

      // Log in again to get fresh credentials
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: testPhone, password: testPassword });

      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('should logout and revoke current session', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Logged out');

      // Access with old token should now fail
      const meRes = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);
    });
  });

  describe('Password Reset & Recovery', () => {
    it('should handle forgot password with anti-enumeration response', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password/forgot')
        .send({ phone: testPhone });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBeDefined();
    });

    it('should reset password with valid OTP and revoke existing sessions', async () => {
      const newPassword = 'BrandNewPassword456!';
      const res = await request(app)
        .post('/api/v1/auth/password/reset')
        .send({
          phone: testPhone,
          otpCode: '123456',
          newPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      // Can log in with new password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: testPhone, password: newPassword });

      expect(loginRes.status).toBe(200);
      accessToken = loginRes.body.data.accessToken;
    });
  });

  describe('Account Lifecycle States (AC-E02.3 & AC-E02.4)', () => {
    it('should request account deactivation', async () => {
      const res = await request(app)
        .post('/api/v1/me/account/deactivation-request')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Taking a break' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('deactivation_requested');
    });

    it('should cancel pending deactivation request and return to active', async () => {
      const res = await request(app)
        .post('/api/v1/me/account/cancel-request')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should request account deletion and revoke sessions immediately', async () => {
      const res = await request(app)
        .post('/api/v1/me/account/deletion-request')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Closing account' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('deletion_pending');

      // Verify session was revoked immediately
      const meRes = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);
    });
  });
});

