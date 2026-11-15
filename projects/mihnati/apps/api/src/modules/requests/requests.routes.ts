import { Router } from 'express';
import { RequestsController } from './requests.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createRequestsRouter(
  controller: RequestsController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Opportunity Feed (Accessible by authenticated verified professionals) ──
  router.get('/opportunities', authMiddleware, controller.getOpportunityFeed);

  // ── Customer Service Request Endpoints ──
  router.post('/service-requests', authMiddleware, controller.createRequest);
  router.get('/service-requests/me', authMiddleware, controller.listMyRequests);
  router.get('/service-requests/:id', authMiddleware, controller.getRequestById);
  router.get('/service-requests/:id/offers', authMiddleware, controller.listOffersForRequest);
  router.post('/service-requests/:id/offers/:offerId/accept', authMiddleware, controller.acceptOffer);
  router.post('/service-requests/:id/reopen', authMiddleware, controller.reopenRequest);

  // ── Professional Offer Endpoints ──
  router.post('/service-requests/:id/offers', authMiddleware, controller.sendOffer);
  router.post('/offers/:offerId/withdraw', authMiddleware, controller.withdrawOffer);

  return router;
}

