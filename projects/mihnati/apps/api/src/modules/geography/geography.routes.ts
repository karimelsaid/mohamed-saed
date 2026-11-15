import { Router } from 'express';
import { GeographyController } from './geography.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createGeographyRouter(
  geographyController: GeographyController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // Public geography catalog endpoints
  router.get('/geography/governorates', geographyController.listGovernorates);
  router.get('/geography/governorates/:govId/localities', geographyController.listLocalities);

  // Authenticated address management for the current user
  router.get('/me/addresses', authMiddleware, geographyController.listAddresses);
  router.post('/me/addresses', authMiddleware, geographyController.createAddress);
  router.patch('/me/addresses/:id', authMiddleware, geographyController.updateAddress);
  router.delete('/me/addresses/:id', authMiddleware, geographyController.deleteAddress);
  router.post('/me/addresses/:id/default', authMiddleware, geographyController.setDefaultAddress);

  return router;
}

