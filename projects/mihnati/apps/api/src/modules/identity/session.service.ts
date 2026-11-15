import { randomUUID } from 'crypto';
import { getDb } from '../../platform/database/connection.js';
import { generateSecureToken, hashToken } from './crypto.js';
import { SessionDoc, AuthTokens } from './auth.types.js';
import { UnauthenticatedError } from '../../platform/http/errors.js';
import { logger } from '../../platform/logging/logger.js';
import { AppConfig } from '../../platform/config/env.js';

export class SessionService {
  constructor(private readonly config: AppConfig) {}

  private getCollection() {
    return getDb().collection<SessionDoc>('sessions');
  }

  /**
   * Creates a new session for a user.
   */
  async createSession(params: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    tokenFamily?: string;
  }): Promise<{ session: SessionDoc; tokens: AuthTokens }> {
    const col = this.getCollection();
    const sessionId = `sess_${randomUUID()}`;
    const tokenFamily = params.tokenFamily || randomUUID();
    const rawRefreshToken = generateSecureToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const rawAccessToken = `at_${sessionId}_${generateSecureToken(16)}`;

    const refreshExpiryDays = this.config.SESSION_REFRESH_LIFETIME_DAYS;
    const expiresAt = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    const sessionDoc: SessionDoc = {
      _id: sessionId,
      userId: params.userId,
      refreshTokenHash,
      tokenFamily,
      isRevoked: false,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      lastUsedAt: new Date(),
      expiresAt,
      createdAt: new Date(),
    };

    await col.insertOne(sessionDoc);

    return {
      session: sessionDoc,
      tokens: {
        accessToken: rawAccessToken,
        refreshToken: `${sessionId}:${rawRefreshToken}`,
        expiresAt,
      },
    };
  }

  /**
   * Refreshes a session using refresh token rotation.
   * If a reused token in a family is detected, ALL sessions in that family are revoked.
   */
  async rotateSession(
    refreshTokenInput: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ session: SessionDoc; tokens: AuthTokens }> {
    const col = this.getCollection();
    const parts = refreshTokenInput.split(':');
    if (parts.length !== 2) {
      throw new UnauthenticatedError('Invalid refresh token format');
    }

    const [sessionId, rawToken] = parts;
    const incomingHash = hashToken(rawToken);

    const session = await col.findOne({ _id: sessionId });
    if (!session) {
      throw new UnauthenticatedError('Session not found or expired');
    }

    // Reuse detection: If session is already revoked or token hash doesn't match
    if (session.isRevoked || session.refreshTokenHash !== incomingHash) {
      // Possible compromise: Revoke the entire token family
      await col.updateMany(
        { tokenFamily: session.tokenFamily },
        { $set: { isRevoked: true, revokedReason: 'TOKEN_REUSE_DETECTED' } }
      );

      logger.warn('Token reuse detected! Revoked entire token family', {
        action: 'session:reuse_detected',
        userId: session.userId,
        tokenFamily: session.tokenFamily,
      });

      throw new UnauthenticatedError('Token reuse detected. All sessions have been revoked.');
    }

    if (new Date() > session.expiresAt) {
      await col.updateOne({ _id: sessionId }, { $set: { isRevoked: true, revokedReason: 'EXPIRED' } });
      throw new UnauthenticatedError('Session has expired');
    }

    // Generate new rotated tokens for the same family
    const newRawRefreshToken = generateSecureToken(32);
    const newRefreshTokenHash = hashToken(newRawRefreshToken);
    const newRawAccessToken = `at_${sessionId}_${generateSecureToken(16)}`;

    await col.updateOne(
      { _id: sessionId },
      {
        $set: {
          refreshTokenHash: newRefreshTokenHash,
          lastUsedAt: new Date(),
          ipAddress: ipAddress || session.ipAddress,
          userAgent: userAgent || session.userAgent,
        },
      }
    );

    return {
      session: {
        ...session,
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
      },
      tokens: {
        accessToken: newRawAccessToken,
        refreshToken: `${sessionId}:${newRawRefreshToken}`,
        expiresAt: session.expiresAt,
      },
    };
  }

  /**
   * Validates an access token and returns the associated session if active.
   */
  async validateAccessToken(accessToken: string): Promise<SessionDoc | null> {
    if (!accessToken.startsWith('at_sess_')) {
      return null;
    }

    const match = accessToken.match(/^at_(sess_[0-9a-f\-]+)_[0-9a-f]+$/);
    if (!match) {
      return null;
    }

    const sessionId = match[1];
    const col = this.getCollection();
    const session = await col.findOne({ _id: sessionId, isRevoked: false });

    if (!session || new Date() > session.expiresAt) {
      return null;
    }

    // Update lastUsedAt if more than 5 minutes old
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (session.lastUsedAt < fiveMinutesAgo) {
      await col.updateOne({ _id: sessionId }, { $set: { lastUsedAt: new Date() } });
    }

    return session;
  }

  /**
   * Revokes a single session.
   */
  async revokeSession(sessionId: string, userId?: string): Promise<boolean> {
    const col = this.getCollection();
    const filter: Record<string, unknown> = { _id: sessionId };
    if (userId) {
      filter['userId'] = userId;
    }

    const result = await col.updateOne(filter, {
      $set: { isRevoked: true, revokedReason: 'USER_LOGOUT' },
    });

    return result.modifiedCount > 0;
  }

  /**
   * Revokes all active sessions for a user (on password change, suspension, etc.).
   */
  async revokeAllUserSessions(userId: string, reason = 'BULK_REVOKE'): Promise<number> {
    const col = this.getCollection();
    const result = await col.updateMany(
      { userId, isRevoked: false },
      { $set: { isRevoked: true, revokedReason: reason } }
    );
    return result.modifiedCount;
  }

  /**
   * Lists active sessions for a user.
   */
  async listUserSessions(userId: string): Promise<SessionDoc[]> {
    const col = this.getCollection();
    return col
      .find({ userId, isRevoked: false, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 })
      .toArray();
  }
}

