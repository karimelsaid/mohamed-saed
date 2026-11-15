import { Router } from 'express';
import { DisputesController } from './disputes.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createDisputesRouter(
  controller: DisputesController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ══════════════════════════════════════════════════════════════
  // ── Support Tickets & Messages ──
  // ══════════════════════════════════════════════════════════════

  router.post('/support/tickets', authMiddleware, controller.createSupportTicket);
  router.get('/support/tickets/me', authMiddleware, controller.getMySupportTickets);
  router.get('/support/tickets/:id', authMiddleware, controller.getSupportTicket);
  router.post('/support/tickets/:id/messages', authMiddleware, controller.createSupportMessage);
  router.get('/support/tickets/:id/messages', authMiddleware, controller.getSupportMessages);

  // Admin / Support Staff Ticket Management
  router.get(
    '/admin/support/tickets',
    authMiddleware,
    requirePermission(PERMISSIONS.SUPPORT_MANAGE),
    controller.adminListSupportTickets
  );
  router.post(
    '/admin/support/tickets/:id/assign',
    authMiddleware,
    requirePermission(PERMISSIONS.SUPPORT_MANAGE),
    controller.adminAssignTicket
  );
  router.patch(
    '/admin/support/tickets/:id/status',
    authMiddleware,
    requirePermission(PERMISSIONS.SUPPORT_MANAGE),
    controller.adminUpdateTicketStatus
  );

  // ══════════════════════════════════════════════════════════════
  // ── Reports ──
  // ══════════════════════════════════════════════════════════════

  router.post('/reports', authMiddleware, controller.createReport);
  router.get(
    '/admin/reports',
    authMiddleware,
    requirePermission(PERMISSIONS.SUPPORT_MANAGE),
    controller.adminListReports
  );
  router.post(
    '/admin/reports/:id/resolve',
    authMiddleware,
    requirePermission(PERMISSIONS.SUPPORT_MANAGE),
    controller.adminResolveReport
  );

  // ══════════════════════════════════════════════════════════════
  // ── Formal Order Disputes ──
  // ══════════════════════════════════════════════════════════════

  router.post('/disputes', authMiddleware, controller.createDispute);
  router.get('/disputes/me', authMiddleware, controller.getMyDisputes);
  router.get('/disputes/:id', authMiddleware, controller.getDispute);
  router.post('/disputes/:id/evidence', authMiddleware, controller.submitEvidence);
  router.post('/disputes/:id/appeal', authMiddleware, controller.appealDispute);

  // Admin / Reviewer Dispute Management
  router.get(
    '/admin/disputes',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.adminListDisputes
  );
  router.post(
    '/admin/disputes/:id/assign',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.adminAssignDispute
  );
  router.post(
    '/admin/disputes/:id/request-evidence',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.adminRequestEvidence
  );
  router.post(
    '/admin/disputes/:id/decision',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.adminIssueDecision
  );
  router.post(
    '/admin/disputes/:id/appeal-decision',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.adminAppealDecision
  );
  router.post(
    '/admin/disputes/:id/dismiss',
    authMiddleware,
    requirePermission(PERMISSIONS.DISPUTES_MANAGE),
    controller.adminDismissDispute
  );

  // ══════════════════════════════════════════════════════════════
  // ── Return Requests ──
  // ══════════════════════════════════════════════════════════════

  router.post('/returns', authMiddleware, controller.createReturnRequest);
  router.get('/returns/me', authMiddleware, controller.getMyReturnRequests);
  router.get('/merchant/returns', authMiddleware, controller.getMerchantReturnRequests);
  router.get('/returns/:id', authMiddleware, controller.getReturnRequest);
  router.post('/merchant/returns/:id/review', authMiddleware, controller.merchantReviewReturn);
  router.post('/returns/:id/ship', authMiddleware, controller.customerShipReturn);
  router.post('/merchant/returns/:id/receive', authMiddleware, controller.merchantReceiveReturn);
  router.post('/merchant/returns/:id/inspect', authMiddleware, controller.merchantInspectReturn);
  router.post('/merchant/returns/:id/resolve', authMiddleware, controller.merchantResolveReturn);
  router.post('/returns/:id/dispute', authMiddleware, controller.escalateReturnToDispute);

  return router;
}

