import { randomInt } from 'crypto';
import { getDb } from '../../platform/database/connection.js';
import { hashToken, normalizePhone } from './crypto.js';
import { OtpChallengeDoc } from './auth.types.js';
import { OtpPort } from '../../platform/adapters/ports.js';
import { RateLimitedError, ValidationError } from '../../platform/http/errors.js';
import { logger } from '../../platform/logging/logger.js';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_15_MIN = 3;

export class OtpService {
  constructor(private readonly otpAdapter: OtpPort) {}

  private getCollection() {
    return getDb().collection<OtpChallengeDoc>('otp_challenges');
  }

  /**
   * Generates and sends a new OTP to the specified phone.
   * Enforces rate limits: max 3 requests per 15 minutes per phone.
   */
  async sendOtp(phone: string, purpose: 'registration' | 'login' | 'password_reset'): Promise<{ success: boolean }> {
    const normalizedPhone = normalizePhone(phone);
    const col = this.getCollection();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const recentCount = await col.countDocuments({
      phone: normalizedPhone,
      createdAt: { $gte: fifteenMinutesAgo },
    });

    if (recentCount >= MAX_SENDS_PER_15_MIN) {
      throw new RateLimitedError('Too many OTP requests. Please wait 15 minutes before trying again.');
    }

    // Generate 6-digit OTP
    const code = process.env['NODE_ENV'] === 'test' ? '123456' : String(randomInt(100000, 999999));
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Save challenge record
    await col.insertOne({
      _id: `otp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      phone: normalizedPhone,
      codeHash,
      purpose,
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
    });

    // Dispatch via OTP port (fake or live)
    await this.otpAdapter.sendOtp(normalizedPhone, code);

    logger.info('OTP challenge created and sent', {
      action: 'otp:sent',
      phone: normalizedPhone.slice(-4),
      purpose,
    });

    return { success: true };
  }

  /**
   * Verifies an OTP code for a phone number.
   * Increments attempts and locks on max attempts reached.
   */
  async verifyOtp(phone: string, code: string, purpose: 'registration' | 'login' | 'password_reset'): Promise<boolean> {
    const normalizedPhone = normalizePhone(phone);
    const col = this.getCollection();
    const now = new Date();

    const challenge = await col.findOne(
      {
        phone: normalizedPhone,
        purpose,
        expiresAt: { $gt: now },
        verifiedAt: { $exists: false },
      },
      { sort: { createdAt: -1 } }
    );

    if (!challenge) {
      return false;
    }

    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new ValidationError('Maximum OTP verification attempts exceeded. Please request a new code.');
    }

    const inputHash = hashToken(code);
    if (inputHash !== challenge.codeHash) {
      await col.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
      return false;
    }

    // Mark verified
    await col.updateOne(
      { _id: challenge._id },
      { $set: { verifiedAt: now } }
    );

    return true;
  }
}
