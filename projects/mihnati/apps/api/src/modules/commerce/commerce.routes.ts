import { Router } from 'express';
import { CommerceController } from './commerce.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createCommerceRouter(
  controller: CommerceController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Address Routes ──
  router.post('/addresses', authMiddleware, controller.addAddress);
  router.get('/addresses', authMiddleware, controller.listAddresses);
  router.get('/addresses/:id', authMiddleware, controller.getAddress);

  // ── Cart Routes (E11-T01) ──
  router.get('/cart', authMiddleware, controller.getCart);
  router.post('/cart/items', authMiddleware, controller.addItem);
  router.patch('/cart/items/:productId', authMiddleware, controller.updateQuantity);
  router.delete('/cart/items/:productId', authMiddleware, controller.removeItem);
  router.post('/cart/switch-store', authMiddleware, controller.switchStore);
  router.delete('/cart', authMiddleware, controller.clearCart);

  // ── Checkout Routes (E11-T02) ──
  router.post('/checkout/quote', authMiddleware, controller.getQuote);
  router.post('/checkout', authMiddleware, controller.checkout);

  return router;
}

