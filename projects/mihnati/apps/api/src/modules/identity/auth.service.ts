import { randomUUID } from 'crypto';
import { getDb } from '../../platform/database/connection.js';
import { hashPassword, verifyPassword, normalizePhone } from './crypto.js';
import { UserDoc, UserProfileDto } from './auth.types.js';
import { SessionService } from './session.service.js';
import { OtpService } from './otp.service.js';
import {
  ConflictError,
  UnauthenticatedError,
  ValidationError,
  ForbiddenError,
} from '../../platform/http/errors.js';
import { logger } from '../../platform/logging/logger.js';

export class AuthService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService
  ) {}

  private getUsersCollection() {
    return getDb().collection<UserDoc>('users');
  }

  /**
   * Registers a new user.
   * Duplicate phone cannot create two users.
   */
  async register(params: {
    phone: string;
    password: string;
    name: string;
    locale?: 'ar' | 'en';
    otpCode?: string;
  }): Promise<{ user: UserProfileDto }> {
    const normalizedPhone = normalizePhone(params.phone);
    const col = this.getUsersCollection();

    // Check if phone already registered
    const existing = await col.findOne({ phone: normalizedPhone });
    if (existing) {
      throw new ConflictError('A user with this phone number already exists', 'CONFLICT', {
        field: 'phone',
      });
    }

    // If OTP code provided, verify it
    if (params.otpCode) {
      const isValid = await this.otpService.verifyOtp(normalizedPhone, params.otpCode, 'registration');
      if (!isValid) {
        throw new ValidationError('Invalid or expired OTP verification code', { field: 'otpCode' });
      }
    }

    if (params.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long', { field: 'password' });
    }

    const passwordHash = await hashPassword(params.password);
    const now = new Date();
    const userDoc: UserDoc = {
      _id: `usr_${randomUUID()}`,
      phone: normalizedPhone,
      passwordHash,
      status: 'active',
      locale: params.locale || 'ar',
      name: params.name,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(userDoc);

    logger.info('User registered successfully', {
      action: 'auth:register',
      userId: userDoc._id,
      phone: normalizedPhone.slice(-4),
    });

    return {
      user: {
        id: userDoc._id,
        phone: userDoc.phone,
        name: userDoc.name,
        locale: userDoc.locale,
        status: userDoc.status,
        createdAt: userDoc.createdAt.toISOString(),
      },
    };
  }

  /**
   * Logs in a user using normalized phone and password.
   * Does not enumerate accounts on failure.
   */
  async login(params: {
    phone: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: UserProfileDto; accessToken: string; refreshToken: string }> {
    const normalizedPhone = normalizePhone(params.phone);
    const col = this.getUsersCollection();

    const user = await col.findOne({ phone: normalizedPhone });
    if (!user) {
      // Timing-safe dummy check to avoid timing enumeration
      await hashPassword('dummy-password-for-timing');
      throw new UnauthenticatedError('Invalid phone number or password');
    }

    const passwordMatches = await verifyPassword(params.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthenticatedError('Invalid phone number or password');
    }

    // Account status check
    if (user.status === 'suspended') {
      throw new ForbiddenError('Account is suspended. Please contact customer support.');
    }
    if (user.status === 'deactivated') {
      throw new ForbiddenError('Account is deactivated. Please contact support to reactivate.');
    }
    if (user.status === 'deleted' || user.status === 'anonymized') {
      throw new UnauthenticatedError('Invalid phone number or password');
    }

    // Create session
    const { tokens } = await this.sessionService.createSession({
      userId: user._id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    logger.info('User logged in successfully', {
      action: 'auth:login',
      userId: user._id,
    });

    return {
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        locale: user.locale,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /**
   * Initiates forgot password flow.
   * Always returns success to prevent phone number enumeration.
   */
  async forgotPassword(phone: string): Promise<{ success: boolean; message: string }> {
    const normalizedPhone = normalizePhone(phone);
    const col = this.getUsersCollection();
    const user = await col.findOne({ phone: normalizedPhone, status: 'active' });

    if (user) {
      await this.otpService.sendOtp(normalizedPhone, 'password_reset');
    }

    // Constant message whether account exists or not
    return {
      success: true,
      message: 'If an account exists with this phone number, a verification code has been sent.',
    };
  }

  /**
   * Resets password with valid OTP code and revokes all active sessions.
   */
  async resetPassword(params: {
    phone: string;
    otpCode: string;
    newPassword: string;
  }): Promise<{ success: boolean }> {
    const normalizedPhone = normalizePhone(params.phone);
    const col = this.getUsersCollection();

    if (params.newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long', { field: 'newPassword' });
    }

    const isValid = await this.otpService.verifyOtp(normalizedPhone, params.otpCode, 'password_reset');
    if (!isValid) {
      throw new ValidationError('Invalid or expired OTP code', { field: 'otpCode' });
    }

    const user = await col.findOne({ phone: normalizedPhone });
    if (!user) {
      throw new UnauthenticatedError('Unable to reset password');
    }

    const newPasswordHash = await hashPassword(params.newPassword);
    await col.updateOne(
      { _id: user._id },
      {
        $set: { passwordHash: newPasswordHash, updatedAt: new Date() },
        $inc: { version: 1 },
      }
    );

    // Revoke all existing sessions for security
    await this.sessionService.revokeAllUserSessions(user._id, 'PASSWORD_RESET');

    logger.info('Password reset successfully and sessions revoked', {
      action: 'auth:password_reset',
      userId: user._id,
    });

    return { success: true };
  }

  /**
   * Finds a user by ID.
   */
  async getUserById(userId: string): Promise<UserDoc | null> {
    const col = this.getUsersCollection();
    return col.findOne({ _id: userId });
  }

  /**
   * Updates profile fields (name, locale).
   */
  async updateProfile(userId: string, data: { name?: string; locale?: 'ar' | 'en' }): Promise<UserProfileDto> {
    const col = this.getUsersCollection();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name) updates['name'] = data.name;
    if (data.locale) updates['locale'] = data.locale;

    const result = await col.findOneAndUpdate(
      { _id: userId },
      { $set: updates, $inc: { version: 1 } },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new UnauthenticatedError('User not found');
    }

    return {
      id: result._id,
      phone: result.phone,
      name: result.name,
      locale: result.locale,
      status: result.status,
      createdAt: result.createdAt.toISOString(),
    };
  }
}

