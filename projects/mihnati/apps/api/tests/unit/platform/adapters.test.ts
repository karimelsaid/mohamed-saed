import { describe, it, expect } from 'vitest';
import {
  FakeObjectStorage,
  FakeOtp,
  FakeMaps,
  FakeNotification,
  FakePayment,
} from '../../../src/platform/adapters/fakes.js';

describe('Fake Adapters', () => {
  describe('FakeObjectStorage', () => {
    it('should create upload intent and return key/url', async () => {
      const storage = new FakeObjectStorage();
      const intent = await storage.createUploadIntent({
        ownerId: 'user-1',
        mediaType: 'image/jpeg',
        maxBytes: 5000000,
        context: 'verification',
      });
      expect(intent.key).toContain('fake/verification/');
      expect(intent.uploadUrl).toContain('fake-upload');
      expect(intent.expiresAt).toBeInstanceOf(Date);
    });

    it('should return signed download URL', async () => {
      const storage = new FakeObjectStorage();
      const url = await storage.getSignedDownloadUrl('some-key');
      expect(url).toContain('fake-download/some-key');
    });

    it('should delete objects without error', async () => {
      const storage = new FakeObjectStorage();
      await expect(storage.deleteObject('key')).resolves.toBeUndefined();
    });

    it('should scan objects as clean', async () => {
      const storage = new FakeObjectStorage();
      const result = await storage.scanObject('key');
      expect(result.clean).toBe(true);
    });
  });

  describe('FakeOtp', () => {
    it('should record sent OTPs', async () => {
      const otp = new FakeOtp();
      const result = await otp.sendOtp('+201234567890', '123456');
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(otp.sentOtps).toHaveLength(1);
      expect(otp.sentOtps[0]).toEqual({ phone: '+201234567890', code: '123456' });
    });
  });

  describe('FakeMaps', () => {
    it('should return fake geocode result', async () => {
      const maps = new FakeMaps();
      const result = await maps.geocode('Cairo, Egypt');
      expect(result).not.toBeNull();
      expect(result!.latitude).toBeCloseTo(30.0444, 2);
      expect(result!.longitude).toBeCloseTo(31.2357, 2);
    });

    it('should return fake reverse geocode', async () => {
      const maps = new FakeMaps();
      const result = await maps.reverseGeocode(30.0, 31.0);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('FakeNotification', () => {
    it('should record sent notifications', async () => {
      const notif = new FakeNotification();
      const result = await notif.send({
        userId: 'user-1',
        type: 'test',
        title: 'Hello',
        body: 'World',
      });
      expect(result.success).toBe(true);
      expect(notif.sentNotifications).toHaveLength(1);
    });
  });

  describe('FakePayment', () => {
    it('should create fake payment intent', async () => {
      const payment = new FakePayment();
      const result = await payment.createIntent({
        amountMinorUnits: 10000,
        currency: 'EGP',
        description: 'Test payment',
      });
      expect(result.intentId).toContain('fake-intent');
      expect(result.status).toBe('pending');
    });

    it('should verify webhook signatures (always true)', () => {
      const payment = new FakePayment();
      expect(payment.verifyWebhookSignature('payload', 'sig')).toBe(true);
    });
  });
});

