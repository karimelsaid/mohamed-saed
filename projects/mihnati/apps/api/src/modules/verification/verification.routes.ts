import { Router } from 'express';
import { VerificationController } from './verification.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createVerificationRouter(
  controller: VerificationController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);
  const requireVerificationReview = requirePermission(PERMISSIONS.VERIFICATION_REVIEW);

  // ── Public Routes ──
  router.get('/professionals/:slug', controller.getPublicProfile);

  // ── Applicant Verification Routes ──
  router.get('/verification-cases/me', authMiddleware, controller.getMyCase);
  router.post('/verification-cases', authMiddleware, controller.createOrGetCase);
  router.post('/verification-cases/:caseId/documents', authMiddleware, controller.uploadDocument);
  router.post('/verification-cases/:caseId/submit', authMiddleware, controller.submitCase);

  // ── Professional Portfolio Routes ──
  router.get('/profiles/professional/me/portfolio', authMiddleware, controller.listMyPortfolio);
  router.post('/profiles/professional/me/portfolio', authMiddleware, controller.addPortfolio);
  router.delete('/profiles/professional/me/portfolio/:id', authMiddleware, controller.deletePortfolio);

  // ── Admin Verification Queue & Review ──
  router.get(
    '/admin/verification-cases',
    authMiddleware,
    requireVerificationReview,
    controller.adminListCases
  );
  router.get(
    '/admin/verification-cases/:caseId',
    authMiddleware,
    requireVerificationReview,
    controller.adminGetCase
  );
  router.post(
    '/admin/verification-cases/:caseId/decide',
    authMiddleware,
    requireVerificationReview,
    controller.adminDecideCase
  );

  return router;
}

