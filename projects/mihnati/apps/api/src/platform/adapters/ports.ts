/**
 * Integration adapter interfaces — ports for external services.
 * E01 provides only fake/mock adapters. Production adapters are deferred.
 * No live provider is activated in E01.
 */

// ─── Object Storage Port ─────────────────────────────────────
export interface UploadIntent {
  key: string;
  uploadUrl: string;
  expiresAt: Date;
}

export interface ObjectStoragePort {
  createUploadIntent(params: {
    ownerId: string;
    mediaType: string;
    maxBytes: number;
    context: string;
  }): Promise<UploadIntent>;

  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;

  deleteObject(key: string): Promise<void>;

  scanObject(key: string): Promise<{ clean: boolean; threats?: string[] }>;
}

// ─── OTP Port ────────────────────────────────────────────────
export interface OtpPort {
  sendOtp(phone: string, code: string): Promise<{ success: boolean; messageId?: string }>;
}

// ─── Maps / Geocoding Port ────────────────────────────────────
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface MapsPort {
  geocode(address: string): Promise<GeocodeResult | null>;
  reverseGeocode(lat: number, lng: number): Promise<string | null>;
}

// ─── Notification Port ───────────────────────────────────────
export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationPort {
  send(payload: NotificationPayload): Promise<{ success: boolean; deliveryId?: string }>;
}

// ─── Payment Port (deferred — no live provider in E01) ────────
export interface PaymentIntentParams {
  amountMinorUnits: number;
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentPort {
  createIntent(params: PaymentIntentParams): Promise<{ intentId: string; status: string }>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

