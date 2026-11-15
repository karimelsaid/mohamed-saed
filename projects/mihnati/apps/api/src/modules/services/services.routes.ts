import { Router } from 'express';
import { ServicesController } from './services.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createServicesRouter(
  controller: ServicesController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);
  const requireServiceModerate = requirePermission(PERMISSIONS.SERVICES_MODERATE);

  // ── Public Routes ──
  router.get('/services/search', controller.searchServices);

  // ── Professional Service Endpoints ──
  router.post('/services', authMiddleware, controller.createDraft);
  router.get('/services/me', authMiddleware, controller.listMyServices);
  router.patch('/services/:id', authMiddleware, controller.updateDraft);
  router.post('/services/:id/submit', authMiddleware, controller.submitForReview);
  router.post('/services/:id/pause', authMiddleware, controller.pause);
  router.post('/services/:id/resume', authMiddleware, controller.resume);
  router.post('/services/:id/archive', authMiddleware, controller.archive);

  // ── Admin Moderation Endpoints ──
  router.get(
    '/admin/services/pending',
    authMiddleware,
    requireServiceModerate,
    controller.adminListPending
  );
  router.post(
    '/admin/services/:id/moderate',
    authMiddleware,
    requireServiceModerate,
    controller.adminModerate
  );

  return router;
}

