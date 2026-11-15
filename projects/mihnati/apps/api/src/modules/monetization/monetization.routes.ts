import { Router } from 'express';
import { MonetizationController } from './monetization.controller.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { PERMISSIONS } from '../admin/rbac.types.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createMonetizationRouter(
  monetizationController: MonetizationController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ══════════════════════════════════════════════════════════════
  // ── 1. Public Endpoints ──
  // ══════════════════════════════════════════════════════════════

  router.get('/commissions/quote', monetizationController.getCommissionQuote);
  router.get('/subscriptions/plans', monetizationController.listSubscriptionPlans);

  // ══════════════════════════════════════════════════════════════
  // ── 2. Authenticated User Endpoints ──
  // ══════════════════════════════════════════════════════════════

  router.get('/subscriptions/me', authMiddleware, monetizationController.getMySubscription);
  router.post('/subscriptions/subscribe', authMiddleware, monetizationController.subscribe);
  router.post('/subscriptions/:id/cancel', authMiddleware, monetizationController.cancelSubscription);
  router.get('/subscriptions/invoices', authMiddleware, monetizationController.listMyInvoices);

  // ══════════════════════════════════════════════════════════════
  // ── 3. Admin / Finance Endpoints ──
  // ══════════════════════════════════════════════════════════════

  // Commission Rules
  router.get(
    '/admin/commissions/rules',
    authMiddleware,
    requirePermission(PERMISSIONS.FINANCE_READ),
    monetizationController.listCommissionRules
  );
  router.post(
    '/admin/commissions/rules',
    authMiddleware,
    requirePermission(PERMISSIONS.COMMISSIONS_MANAGE),
    monetizationController.proposeCommissionRule
  );
  router.post(
    '/admin/commissions/rules/:id/approve',
    authMiddleware,
    requirePermission(PERMISSIONS.COMMISSIONS_MANAGE),
    monetizationController.approveCommissionRule
  );
  router.post(
    '/admin/commissions/rules/:id/archive',
    authMiddleware,
    requirePermission(PERMISSIONS.COMMISSIONS_MANAGE),
    monetizationController.archiveCommissionRule
  );

  // Commission Snapshots & Collection
  router.get(
    '/admin/commissions/snapshots',
    authMiddleware,
    requirePermission(PERMISSIONS.FINANCE_READ),
    monetizationController.listCommissionSnapshots
  );
  router.post(
    '/admin/commissions/snapshots/:id/collection-status',
    authMiddleware,
    requirePermission(PERMISSIONS.COMMISSIONS_MANAGE),
    monetizationController.updateCollectionStatus
  );

  // Subscription Administration
  router.post(
    '/admin/subscriptions/plans',
    authMiddleware,
    requirePermission(PERMISSIONS.SUBSCRIPTIONS_MANAGE),
    monetizationController.createSubscriptionPlan
  );
  router.get(
    '/admin/subscriptions',
    authMiddleware,
    requirePermission(PERMISSIONS.FINANCE_READ),
    monetizationController.listAdminSubscriptions
  );
  router.post(
    '/admin/subscriptions/:id/renew',
    authMiddleware,
    requirePermission(PERMISSIONS.SUBSCRIPTIONS_MANAGE),
    monetizationController.renewSubscription
  );

  return router;
}

