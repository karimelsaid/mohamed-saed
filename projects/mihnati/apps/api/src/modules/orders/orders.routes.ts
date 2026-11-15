import { Router } from 'express';
import { OrdersController } from './orders.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createOrdersRouter(
  controller: OrdersController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Service Order Lifecycle Commands ──
  router.get('/service-orders/me', authMiddleware, controller.listMyOrders);
  router.get('/service-orders/:id', authMiddleware, controller.getOrder);
  router.post('/service-orders/:id/start', authMiddleware, controller.startOrder);
  router.post('/service-orders/:id/submit', authMiddleware, controller.submitOrder);
  router.post('/service-orders/:id/complete', authMiddleware, controller.completeOrder);
  router.post('/service-orders/:id/dispute', authMiddleware, controller.disputeOrder);
  router.post('/service-orders/:id/cancel', authMiddleware, controller.cancelOrder);

  // ── Appointment & Inspection Workflow ──
  router.post('/service-orders/:id/appointments', authMiddleware, controller.proposeAppointment);
  router.post('/appointments/:appointmentId/confirm', authMiddleware, controller.confirmAppointment);

  // ── Address Consent & Reveal ──
  router.post('/service-orders/:id/address-consent', authMiddleware, controller.grantAddressConsent);
  router.delete('/service-orders/:id/address-consent', authMiddleware, controller.revokeAddressConsent);
  router.get('/service-orders/:id/execution-address', authMiddleware, controller.getExecutionAddress);

  // ── Mutual Change Requests ──
  router.post('/service-orders/:id/change-requests', authMiddleware, controller.proposeChange);
  router.post('/order-change-requests/:changeId/decide', authMiddleware, controller.decideChange);

  return router;
}

