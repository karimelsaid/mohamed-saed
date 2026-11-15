import { Router } from 'express';
import { CodController } from './cod.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createCodRouter(
  controller: CodController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Merchant COD Reporting Routes (E14-T01) ──
  router.post('/merchant/orders/:id/cod-reports', authMiddleware, controller.createReport);
  router.get('/merchant/orders/:id/cod-reports', authMiddleware, controller.listMerchantReports);

  // ── Customer COD Disputes & View Routes (E14-T02) ──
  router.get('/merchant-orders/:id/cod-reports', authMiddleware, controller.listCustomerReports);
  router.post('/merchant-orders/:id/cod-disputes', authMiddleware, controller.openDispute);
  router.get('/merchant-orders/:id/cod-disputes', authMiddleware, controller.listOrderDisputes);

  // ── Staff Dispute Management Routes (E14-T02) ──
  router.get(
    '/admin/cod-disputes',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.listDisputesForStaff
  );
  router.post(
    '/admin/cod-disputes/:id/assign',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.assignStaff
  );
  router.post(
    '/admin/cod-disputes/:id/resolve',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.resolveDispute
  );

  return router;
}

