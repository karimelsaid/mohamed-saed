import { Router } from 'express';
import { ReviewsController } from './reviews.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createReviewsRouter(
  controller: ReviewsController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Public Reviews Query ──
  router.get('/reviews', controller.listTargetReviews);

  // ── Participant Review Submission & Response ──
  router.post('/service-orders/:id/reviews', authMiddleware, controller.createServiceOrderReview);
  router.post('/merchant-orders/:id/reviews', authMiddleware, controller.createMerchantOrderReview);
  router.post('/reviews/:id/response', authMiddleware, controller.respondToReview);

  // ── Admin / Staff Moderation Routes ──
  router.get(
    '/admin/reviews',
    authMiddleware,
    requirePermission(PERMISSIONS.REVIEWS_MODERATE),
    controller.listAdminReviews
  );
  router.post(
    '/admin/reviews/:id/moderate',
    authMiddleware,
    requirePermission(PERMISSIONS.REVIEWS_MODERATE),
    controller.moderateReview
  );

  return router;
}

