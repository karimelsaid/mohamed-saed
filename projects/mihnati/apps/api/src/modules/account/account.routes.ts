import { Router } from 'express';
import { AccountController } from './account.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createAccountRouter(
  accountController: AccountController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // All /me routes require authentication
  router.get('/me', authMiddleware, accountController.getMe);
  router.patch('/me', authMiddleware, accountController.updateMe);

  // Session management
  router.get('/me/sessions', authMiddleware, accountController.listSessions);
  router.delete('/me/sessions/:id', authMiddleware, accountController.revokeSession);

  // Account lifecycle
  router.post('/me/account/deactivation-request', authMiddleware, accountController.requestDeactivation);
  router.post('/me/account/deletion-request', authMiddleware, accountController.requestDeletion);
  router.post('/me/account/cancel-request', authMiddleware, accountController.cancelRequest);

  return router;
}

