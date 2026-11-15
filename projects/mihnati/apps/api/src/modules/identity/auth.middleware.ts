import type { Request, Response, NextFunction } from 'express';
import { SessionService } from './session.service.js';
import { AuthService } from './auth.service.js';
import { UnauthenticatedError, ForbiddenError } from '../../platform/http/errors.js';

export interface AuthenticatedUser {
  id: string;
  phone: string;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}

export function createAuthMiddleware(sessionService: SessionService, authService: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Extract token from Authorization header or cookie
      let token: string | undefined;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else if (req.cookies && req.cookies['mihnati_session']) {
        token = req.cookies['mihnati_session'];
      }

      if (!token) {
        throw new UnauthenticatedError('Authentication required');
      }

      // 2. Validate session
      const session = await sessionService.validateAccessToken(token);
      if (!session) {
        throw new UnauthenticatedError('Session invalid or expired');
      }

      // 3. Verify user status
      const user = await authService.getUserById(session.userId);
      if (!user) {
        throw new UnauthenticatedError('User account not found');
      }

      if (user.status === 'suspended') {
        await sessionService.revokeSession(session._id);
        throw new ForbiddenError('Account is suspended');
      }

      if (user.status === 'deactivated' || user.status === 'deleted') {
        await sessionService.revokeSession(session._id);
        throw new ForbiddenError('Account is inactive');
      }

      req.user = {
        id: user._id,
        phone: user.phone,
        status: user.status,
      };
      req.sessionId = session._id;

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * CSRF Protection Middleware for mutating cookie-authenticated requests.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // If request is authenticated via cookie, require X-CSRF-Token or matching header
  if (req.cookies && req.cookies['mihnati_session']) {
    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies['mihnati_csrf'];

    if (!csrfHeader || (csrfCookie && csrfHeader !== csrfCookie)) {
      return next(new ForbiddenError('Invalid or missing CSRF token'));
    }
  }

  next();
}

