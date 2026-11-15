import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { OtpService } from './otp.service.js';
import { ValidationError, UnauthenticatedError } from '../../platform/http/errors.js';
import { SuccessEnvelope } from '@mihnati/contracts';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, password, name, locale, otpCode } = req.body;
      if (!phone || !password || !name) {
        throw new ValidationError('phone, password, and name are required fields');
      }

      const result = await this.authService.register({ phone, password, name, locale, otpCode });
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof result.user> = {
        data: result.user,
        meta: { requestId },
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) {
        throw new ValidationError('phone and password are required fields');
      }

      const result = await this.authService.login({
        phone,
        password,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Set cookies (HttpOnly, SameSite=Lax)
      res.cookie('mihnati_session', result.accessToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 min
      });

      res.cookie('mihnati_refresh', result.refreshToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      const requestId = (res.locals['requestId'] as string) || 'unknown';
      const response: SuccessEnvelope<{
        user: typeof result.user;
        accessToken: string;
        refreshToken: string;
      }> = {
        data: result,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken =
        req.body?.refreshToken || (req.cookies && req.cookies['mihnati_refresh']);

      if (!refreshToken) {
        throw new UnauthenticatedError('Refresh token required');
      }

      const result = await this.sessionService.rotateSession(
        refreshToken,
        req.ip,
        req.headers['user-agent']
      );

      // Rotate cookies
      res.cookie('mihnati_session', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('mihnati_refresh', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      const requestId = (res.locals['requestId'] as string) || 'unknown';
      const response: SuccessEnvelope<{ accessToken: string; refreshToken: string }> = {
        data: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.sessionId) {
        await this.sessionService.revokeSession(req.sessionId, req.user?.id);
      }

      res.clearCookie('mihnati_session');
      res.clearCookie('mihnati_refresh', { path: '/api/v1/auth/refresh' });

      const requestId = (res.locals['requestId'] as string) || 'unknown';
      const response: SuccessEnvelope<{ message: string }> = {
        data: { message: 'Logged out successfully' },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  sendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, purpose } = req.body;
      if (!phone || !purpose) {
        throw new ValidationError('phone and purpose are required fields');
      }

      await this.otpService.sendOtp(phone, purpose);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<{ message: string }> = {
        data: { message: 'Verification code sent' },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  verifyOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, code, purpose } = req.body;
      if (!phone || !code || !purpose) {
        throw new ValidationError('phone, code, and purpose are required fields');
      }

      const isValid = await this.otpService.verifyOtp(phone, code, purpose);
      if (!isValid) {
        throw new ValidationError('Invalid or expired verification code');
      }

      const requestId = (res.locals['requestId'] as string) || 'unknown';
      const response: SuccessEnvelope<{ verified: boolean }> = {
        data: { verified: true },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = req.body;
      if (!phone) {
        throw new ValidationError('phone is required');
      }

      const result = await this.authService.forgotPassword(phone);
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

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otpCode, newPassword } = req.body;
      if (!phone || !otpCode || !newPassword) {
        throw new ValidationError('phone, otpCode, and newPassword are required');
      }

      const result = await this.authService.resetPassword({ phone, otpCode, newPassword });
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

