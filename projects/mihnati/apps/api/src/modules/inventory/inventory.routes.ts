import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createInventoryRouter(
  controller: InventoryController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Merchant Inventory Routes (E12-T01) ──
  router.get('/products/:id/inventory', controller.getStockProjection);
  router.post('/products/:id/inventory-adjustments', authMiddleware, controller.adjustInventory);
  router.get('/products/:id/inventory-movements', authMiddleware, controller.listMovements);

  // ── Internal / Worker Route (E12-T02) ──
  router.post('/inventory/expire-stale-reservations', controller.expireStaleReservations);

  return router;
}

