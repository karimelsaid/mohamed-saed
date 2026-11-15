import { Router } from 'express';
import { RoleController } from './role.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createRoleRouter(
  roleController: RoleController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  router.get('/me/roles', authMiddleware, roleController.getRoles);
  router.post('/me/roles/:roleKey/activate', authMiddleware, roleController.activateRole);
  router.post('/me/roles/:roleKey/deactivate', authMiddleware, roleController.deactivateRole);

  return router;
}

