/**
 * Fake/mock adapters for all integration ports.
 * Used during development, testing, and E01.
 * These are deterministic and never contact external services.
 */
import { logger } from '../logging/logger.js';
import type {
  ObjectStoragePort,
  UploadIntent,
  OtpPort,
  MapsPort,
  GeocodeResult,
  NotificationPort,
  NotificationPayload,
  PaymentPort,
  PaymentIntentParams,
} from './ports.js';

// ─── Fake Object Storage ─────────────────────────────────────
export class FakeObjectStorage implements ObjectStoragePort {
  private readonly store = new Map<string, { ownerId: string; context: string }>();

  async createUploadIntent(params: {
    ownerId: string;
    mediaType: string;
    maxBytes: number;
    context: string;
  }): Promise<UploadIntent> {
    const key = `fake/${params.context}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.store.set(key, { ownerId: params.ownerId, context: params.context });
    logger.debug('FakeObjectStorage: created upload intent', { action: 'fake:storage:upload', key });
    return {
      key,
      uploadUrl: `http://localhost:9999/fake-upload/${key}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    logger.debug('FakeObjectStorage: signed URL requested', { action: 'fake:storage:download', key });
    return `http://localhost:9999/fake-download/${key}?expires=${expiresInSeconds}`;
  }

  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
    logger.debug('FakeObjectStorage: object deleted', { action: 'fake:storage:delete', key });
  }

  async scanObject(_key: string): Promise<{ clean: boolean; threats?: string[] }> {
    return { clean: true };
  }
}

// ─── Fake OTP ────────────────────────────────────────────────
export class FakeOtp implements OtpPort {
  public readonly sentOtps: Array<{ phone: string; code: string }> = [];

  async sendOtp(phone: string, code: string): Promise<{ success: boolean; messageId?: string }> {
    this.sentOtps.push({ phone, code });
    logger.debug('FakeOtp: OTP sent (fake)', { action: 'fake:otp:send', phone: phone.slice(-4) });
    return { success: true, messageId: `fake-${Date.now()}` };
  }
}

// ─── Fake Maps ───────────────────────────────────────────────
export class FakeMaps implements MapsPort {
  async geocode(address: string): Promise<GeocodeResult | null> {
    logger.debug('FakeMaps: geocode', { action: 'fake:maps:geocode', address });
    return {
      latitude: 30.0444,
      longitude: 31.2357,
      formattedAddress: `Cairo, Egypt (fake result for: ${address})`,
    };
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    logger.debug('FakeMaps: reverse geocode', { action: 'fake:maps:reverse', lat, lng });
    return `Fake address near (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }
}

// ─── Fake Notifications ──────────────────────────────────────
export class FakeNotification implements NotificationPort {
  public readonly sentNotifications: NotificationPayload[] = [];

  async send(payload: NotificationPayload): Promise<{ success: boolean; deliveryId?: string }> {
    this.sentNotifications.push(payload);
    logger.debug('FakeNotification: notification sent (fake)', {
      action: 'fake:notification:send',
      userId: payload.userId,
      type: payload.type,
    });
    return { success: true, deliveryId: `fake-notif-${Date.now()}` };
  }
}

// ─── Fake Payment (deferred) ─────────────────────────────────
export class FakePayment implements PaymentPort {
  async createIntent(params: PaymentIntentParams): Promise<{ intentId: string; status: string }> {
    logger.debug('FakePayment: intent created (fake)', {
      action: 'fake:payment:create',
      amount: params.amountMinorUnits,
      currency: params.currency,
    });
    return { intentId: `fake-intent-${Date.now()}`, status: 'pending' };
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true;
  }
}

