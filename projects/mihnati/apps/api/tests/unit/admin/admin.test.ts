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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e17',
    MONGODB_DB_NAME: 'mihnati_test_e17',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('user_role_assignments').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});
  await db.collection('verification_cases').deleteMany({});
  await db.collection('stores').deleteMany({});
  await db.collection('disputes').deleteMany({});
  await db.collection('support_tickets').deleteMany({});
  await db.collection('cod_disputes').deleteMany({});

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E17 Admin Dashboard, RBAC & Operations Workspace', () => {
  let regularToken: string;
  let adminToken: string;
  let supportToken: string;
  let regularUserId: string;
  let adminUserId: string;
  let supportUserId: string;

  beforeAll(async () => {
    // 1. Create a regular customer user
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '01011119999',
        password: 'Password123!',
        name: 'عميل عادي',
      });
    regularUserId = regRes.body.data.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01011119999', password: 'Password123!' });
    regularToken = loginRes.body.data.accessToken;

    // 2. Create an admin user
    const adminRegRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '01022228888',
        password: 'AdminPassword123!',
        name: 'مدير النظام',
      });
    adminUserId = adminRegRes.body.data.id;

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01022228888', password: 'AdminPassword123!' });
    adminToken = adminLoginRes.body.data.accessToken;

    // Seed admin role in user_role_assignments
    const db = getDb();
    await db.collection('user_role_assignments').insertOne({
      _id: 'ura_admin_seed',
      userId: adminUserId,
      roleKey: 'admin',
      status: 'active',
      grantedBy: 'system',
      grantedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // 3. Create a support staff user
    const suppRegRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '01033337777',
        password: 'SupportPass123!',
        name: 'موظف دعم العمليات',
      });
    supportUserId = suppRegRes.body.data.id;

    const suppLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '01033337777', password: 'SupportPass123!' });
    supportToken = suppLoginRes.body.data.accessToken;

    await db.collection('user_role_assignments').insertOne({
      _id: 'ura_support_seed',
      userId: supportUserId,
      roleKey: 'support',
      status: 'active',
      grantedBy: adminUserId,
      grantedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  // ══════════════════════════════════════════════════════════════
  // ── 1. RBAC & Audit Foundation (E17-T01) ──
  // ══════════════════════════════════════════════════════════════

  describe('1. RBAC & Audit Foundation (E17-T01)', () => {
    it('should deny unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('should deny regular user without admin role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${regularToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow authorized admin to read audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should allow support role to read audit logs (defined in support permissions)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${supportToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should deny support role from granting roles (requires ROLES_GRANT which support lacks)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/roles/grant')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          targetUserId: regularUserId,
          roleKey: 'admin',
          reason: 'Unauthorized grant attempt',
        });

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 2. Staff & Account Operations (E17-T02) ──
  // ══════════════════════════════════════════════════════════════

  describe('2. Staff & Account Operations (E17-T02)', () => {
    it('admin lists all users with pagination and search filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?search=عميل')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((u: any) => u.id === regularUserId)).toBe(true);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('admin gets comprehensive user details including profiles and metrics', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/users/${regularUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(regularUserId);
      expect(res.body.data.phone).toContain('1011119999');
      expect(res.body.data.metrics).toBeDefined();
      expect(res.body.data.metrics.activeSessionsCount).toBeGreaterThanOrEqual(1);
    });

    it('prevents administrator from suspending their own account (Self-action guard 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${adminUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Self suspension attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Administrators cannot suspend their own account');
    });

    it('allows admin to suspend a regular user account and revoke their sessions', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${regularUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Investigation of suspicious activity' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('suspended');

      // User session should be revoked (401)
      const meRes = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(meRes.status).toBe(401);

      // Re-login should be rejected with 403
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '01011119999', password: 'Password123!' });
      expect(loginRes.status).toBe(403);
    });

    it('allows admin to unsuspend an account, restoring it to active', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${regularUserId}/unsuspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Investigation completed, account cleared' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');

      // User can now log in again successfully
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '01011119999', password: 'Password123!' });
      expect(loginRes.status).toBe(200);
      regularToken = loginRes.body.data.accessToken;
    });

    it('prevents administrator from revoking their own admin role (Self-action guard 403)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/roles/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetUserId: adminUserId,
          roleKey: 'admin',
          reason: 'Accidental self revocation',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Administrators cannot revoke their own admin privileges');
    });

    it('admin assigns staff role via /admin/staff and lists active staff members', async () => {
      // 1. Assign support role via staff management endpoint
      const assignRes = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetUserId: regularUserId,
          roleKey: 'support',
          reason: 'عين كمسؤول دعم فني إضافي',
        });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.roleKey).toBe('support');

      // 2. List staff
      const listRes = await request(app)
        .get('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
      expect(listRes.body.data.some((s: any) => s.userId === regularUserId && s.roleKey === 'support')).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── 3. Operational Dashboard & Queues (E17-T03) ──
  // ══════════════════════════════════════════════════════════════

  describe('3. Operational Dashboard & Queues (E17-T03)', () => {
    it('admin and support can retrieve live dashboard statistics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users).toBeDefined();
      expect(res.body.data.users.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.operations).toBeDefined();
      expect(res.body.data.system.status).toBe('healthy');
    });

    it('admin retrieves prioritized operational queues', async () => {
      // Seed an item in verification_cases and stores for the queue
      const db = getDb();
      await db.collection('verification_cases').insertOne({
        _id: 'verif-q-1',
        userId: regularUserId,
        profileType: 'professional',
        status: 'pending_review',
        documents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await db.collection('stores').insertOne({
        _id: 'store-q-1',
        nameAr: 'متجر قيد الموافقة',
        nameEn: 'Pending Store',
        merchantUserId: regularUserId,
        status: 'pending_approval',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(app)
        .get('/api/v1/admin/operations/queues')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.verifications).toBeDefined();
      expect(res.body.data.verifications.some((v: any) => v.id === 'verif-q-1')).toBe(true);
      expect(res.body.data.storeApprovals).toBeDefined();
      expect(res.body.data.storeApprovals.some((s: any) => s.id === 'store-q-1')).toBe(true);
    });

    it('admin exports audit logs with time-range and filters, recording an export audit event', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs/export?actorId=' + adminUserId)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.logs).toBeDefined();
      expect(res.body.data.exportedBy).toBe(adminUserId);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);

      // Verify that the export itself was audited
      const db = getDb();
      const exportAudit = await db.collection('admin_audit_logs').findOne({
        action: 'admin:audit_logs:exported',
        actorId: adminUserId,
      });
      expect(exportAudit).not.toBeNull();
    });
  });
});
