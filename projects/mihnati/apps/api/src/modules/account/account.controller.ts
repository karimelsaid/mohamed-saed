import type { Request, Response, NextFunction } from 'express';
import { AccountService } from './account.service.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { NotFoundError, UnauthenticatedError } from '../../platform/http/errors.js';
import { SuccessEnvelope } from '@mihnati/contracts';

export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService
  ) {}

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const user = await this.authService.getUserById(req.user.id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const requestId = (res.locals['requestId'] as string) || 'unknown';
      const response: SuccessEnvelope<{
        id: string;
        phone: string;
        name: string;
        locale: 'ar' | 'en';
        status: string;
        createdAt: string;
      }> = {
        data: {
          id: user._id,
          phone: user.phone,
          name: user.name,
          locale: user.locale,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
        },
        meta: { requestId, version: user.version },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const { name, locale } = req.body;
      const updated = await this.authService.updateProfile(req.user.id, { name, locale });
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof updated> = {
        data: updated,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  listSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const sessions = await this.sessionService.listUserSessions(req.user.id);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const sanitizedSessions = sessions.map((s) => ({
        id: s._id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        lastUsedAt: s.lastUsedAt.toISOString(),
        isCurrent: s._id === req.sessionId,
      }));

      const response: SuccessEnvelope<typeof sanitizedSessions> = {
        data: sanitizedSessions,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const paramId = req.params['id'];
      const sessionId = Array.isArray(paramId) ? paramId[0] : paramId;
      if (!sessionId) {
        throw new NotFoundError('Session ID required');
      }
      const success = await this.sessionService.revokeSession(sessionId, req.user.id);
      if (!success) {
        throw new NotFoundError('Session not found or already revoked');
      }

      const requestId = (res.locals['requestId'] as string) || 'unknown';
      const response: SuccessEnvelope<{ revoked: boolean }> = {
        data: { revoked: true },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  requestDeactivation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const { reason } = req.body || {};
      const result = await this.accountService.requestDeactivation(req.user.id, reason);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof result> = {
        data: result,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  requestDeletion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const { reason } = req.body || {};
      const result = await this.accountService.requestDeletion(req.user.id, reason);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      // Clear cookies
      res.clearCookie('mihnati_session');
      res.clearCookie('mihnati_refresh', { path: '/api/v1/auth/refresh' });

      const response: SuccessEnvelope<typeof result> = {
        data: result,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  cancelRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const result = await this.accountService.cancelRequest(req.user.id);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof result> = {
        data: result,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };
}
