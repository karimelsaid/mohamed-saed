import { Router } from 'express';
import { MerchantOrdersController } from './merchant-orders.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createMerchantOrdersRouter(
  controller: MerchantOrdersController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Customer Routes (E13-T01 & E13-T02) ──
  router.get('/merchant-orders/me', authMiddleware, controller.listCustomerOrders);
  router.get('/merchant-orders/:id', authMiddleware, controller.getCustomerOrder);
  router.post('/merchant-orders/:id/confirm-delivery', authMiddleware, controller.confirmCustomerDelivery);
  router.post('/merchant-orders/:id/cancel', authMiddleware, controller.cancelCustomerOrder);

  // ── Merchant Routes (E13-T01 & E13-T02) ──
  router.get('/merchant/orders', authMiddleware, controller.listMerchantOrders);
  router.get('/merchant/orders/:id', authMiddleware, controller.getMerchantOrder);
  router.get('/merchant/orders/:id/delivery-address', authMiddleware, controller.revealDeliveryAddress);
  router.post('/merchant/orders/:id/confirm', authMiddleware, controller.confirmOrder);
  router.post('/merchant/orders/:id/reject', authMiddleware, controller.rejectOrder);
  router.post('/merchant/orders/:id/prepare', authMiddleware, controller.prepareOrder);
  router.post('/merchant/orders/:id/ready', authMiddleware, controller.readyOrder);
  router.post('/merchant/orders/:id/dispatch', authMiddleware, controller.dispatchOrder);
  router.post('/merchant/orders/:id/mark-delivered', authMiddleware, controller.markDelivered);
  router.post('/merchant/orders/:id/cancel', authMiddleware, controller.cancelMerchantOrder);

  return router;
}

