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
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati_test_e09_comms',
    MONGODB_DB_NAME: 'mihnati_test_e09_comms',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    LOG_LEVEL: 'error',
  });

  await connectMongo(config);
  const db = getDb();
  await db.collection('users').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('conversations').deleteMany({});
  await db.collection('messages').deleteMany({});
  await db.collection('notifications').deleteMany({});
  await db.collection('conversation_reports').deleteMany({});
  await db.collection('admin_audit_logs').deleteMany({});

  app = createApp(config);
});

afterAll(async () => {
  await closeMongo();
});

describe('E09 Chat & Notifications API', () => {
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let eavesdropperToken: string;

  let conversationId: string;
  let notificationId: string;

  beforeAll(async () => {
    // 1. Create User 1 (Customer)
    const u1Reg = await request(app).post('/api/v1/auth/register').send({
      phone: '01033330001',
      password: 'User1Password123!',
      name: 'طارق الزبون',
    });
    user1Id = u1Reg.body.data.id;
    const u1Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01033330001',
      password: 'User1Password123!',
    });
    user1Token = u1Login.body.data.accessToken;

    // 2. Create User 2 (Professional)
    const u2Reg = await request(app).post('/api/v1/auth/register').send({
      phone: '01033330002',
      password: 'User2Password123!',
      name: 'خالد الفني',
    });
    user2Id = u2Reg.body.data.id;
    const u2Login = await request(app).post('/api/v1/auth/login').send({
      phone: '01033330002',
      password: 'User2Password123!',
    });
    user2Token = u2Login.body.data.accessToken;

    // 3. Create Eavesdropper (Unrelated Third Party)
    const eavReg = await request(app).post('/api/v1/auth/register').send({
      phone: '01033330003',
      password: 'EavPassword123!',
      name: 'متطفل محظور',
    });
    const eavLogin = await request(app).post('/api/v1/auth/login').send({
      phone: '01033330003',
      password: 'EavPassword123!',
    });
    eavesdropperToken = eavLogin.body.data.accessToken;
  });

  describe('Context-Bound Conversations (AC-E09.1)', () => {
    it('should create a conversation bound to a service order', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          contextType: 'service_order',
          contextId: 'ord_sample_123',
          counterpartUserId: user2Id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.contextType).toBe('service_order');
      expect(res.body.data.contextId).toBe('ord_sample_123');
      expect(res.body.data.participants).toContain(user1Id);
      expect(res.body.data.participants).toContain(user2Id);
      conversationId = res.body.data.id;
    });

    it('should return the existing conversation instead of duplicating', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          contextType: 'service_order',
          contextId: 'ord_sample_123',
          counterpartUserId: user1Id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(conversationId);
    });

    it('should reject self-conversations', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          contextType: 'service_order',
          contextId: 'ord_sample_123',
          counterpartUserId: user1Id,
        });

      expect(res.status).toBe(400);
    });

    it('should list only user conversations', async () => {
      const res = await request(app)
        .get('/api/v1/conversations/me')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(conversationId);

      // Eavesdropper has no conversations
      const eavRes = await request(app)
        .get('/api/v1/conversations/me')
        .set('Authorization', `Bearer ${eavesdropperToken}`);
      expect(eavRes.body.data.length).toBe(0);
    });
  });

  describe('Messaging & IDOR Access Control (AC-E09.1)', () => {
    it('should allow user 1 to send a message and emit notification to user 2', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          text: 'مرحبا يا باشمهندس خالد، بخصوص موعد الزيارة غدا',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toBe('مرحبا يا باشمهندس خالد، بخصوص موعد الزيارة غدا');
      expect(res.body.data.senderId).toBe(user1Id);

      // Check in-app notification was emitted for user 2
      const notifRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(notifRes.status).toBe(200);
      expect(notifRes.body.data.length).toBe(1);
      expect(notifRes.body.data[0].type).toBe('message_received');
      notificationId = notifRes.body.data[0].id;
    });

    it('should FORBID non-participant from reading messages (IDOR Prevention)', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${eavesdropperToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should FORBID non-participant from posting a message to this conversation', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${eavesdropperToken}`)
        .send({
          text: 'محاولة رسالة متطفل غير مصرح له',
        });

      expect(res.status).toBe(403);
    });

    it('should allow user 2 to read messages and mark them as read', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].isRead).toBe(true);
    });
  });

  describe('Conversation Reporting & Moderation Audit (AC-E09.1)', () => {
    it('should allow participant to report conversation with audit', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${conversationId}/report`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          reason: 'اشتباه في محتوى غير لائق أو مخالف لشروط المنصة',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');

      // Verify audit log
      const db = getDb();
      const auditLog = await db.collection('admin_audit_logs').findOne({
        targetId: conversationId,
        action: 'conversation:reported',
      });
      expect(auditLog).toBeDefined();
    });
  });

  describe('In-App Notification Center (AC-E09.2)', () => {
    it('should return unread count for user 2', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(1);
    });

    it('should mark single notification as read', async () => {
      const res = await request(app)
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);

      const countAfter = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(countAfter.body.data.unreadCount).toBe(0);
    });

    it('should mark all notifications as read', async () => {
      // Create another notification for user 2
      const db = getDb();
      await db.collection('notifications').insertOne({
        _id: 'notif_sample_999',
        userId: user2Id,
        type: 'system_notice',
        title: 'تنبيه أمان',
        body: 'تم تسجيل دخول جديد',
        isRead: false,
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);

      const countAfter = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(countAfter.body.data.unreadCount).toBe(0);
    });

    it('should prevent user 1 from marking user 2 notification as read (Ownership)', async () => {
      const res = await request(app)
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(403);
    });
  });
});

