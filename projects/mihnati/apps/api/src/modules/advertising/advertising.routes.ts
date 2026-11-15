import { Router } from 'express';
import { AdvertisingController } from './advertising.controller.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { PERMISSIONS } from '../admin/rbac.types.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createAdvertisingRouter(
  advertisingController: AdvertisingController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ══════════════════════════════════════════════════════════════
  // ── 1. Public Placements & Delivery Events ──
  // ══════════════════════════════════════════════════════════════

  router.get('/advertising/sponsored-placements', advertisingController.getSponsoredPlacements);
  router.post('/advertising/events', advertisingController.recordDeliveryEvent);

  // ══════════════════════════════════════════════════════════════
  // ── 2. Authenticated Advertiser Endpoints ──
  // ══════════════════════════════════════════════════════════════

  router.post('/advertising/campaigns', authMiddleware, advertisingController.createCampaign);
  router.get('/advertising/campaigns', authMiddleware, advertisingController.listMyCampaigns);
  router.get('/advertising/campaigns/:id/metrics', authMiddleware, advertisingController.getCampaignMetrics);
  router.post('/advertising/campaigns/:id/pause', authMiddleware, advertisingController.pauseCampaign);
  router.post('/advertising/campaigns/:id/resume', authMiddleware, advertisingController.resumeCampaign);

  // ══════════════════════════════════════════════════════════════
  // ── 3. Admin Moderation & Review ──
  // ══════════════════════════════════════════════════════════════

  router.get(
    '/admin/advertising/campaigns',
    authMiddleware,
    requirePermission(PERMISSIONS.CAMPAIGNS_READ),
    advertisingController.listAdminCampaigns
  );

  router.post(
    '/admin/advertising/campaigns/:id/review',
    authMiddleware,
    requirePermission(PERMISSIONS.CAMPAIGNS_MODERATE),
    advertisingController.moderateCampaign
  );

  return router;
}

