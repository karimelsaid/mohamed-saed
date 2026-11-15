import { Router } from 'express';
import { StoresController } from './stores.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createStoresRouter(
  controller: StoresController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);
  const requireStoreModerate = requirePermission(PERMISSIONS.STORES_MODERATE);
  const requireProductModerate = requirePermission(PERMISSIONS.PRODUCTS_MODERATE);

  // ── Merchant Stores Endpoints ──
  router.post('/stores/me', authMiddleware, controller.createStore);
  router.get('/stores/me', authMiddleware, controller.getOwnStore);
  router.patch('/stores/me', authMiddleware, controller.updateOwnStore);
  router.post('/stores/me/submit', authMiddleware, controller.submitStore);
  router.post('/stores/me/pause', authMiddleware, controller.pauseStore);
  router.post('/stores/me/resume', authMiddleware, controller.resumeStore);

  // ── Public Store Endpoints ──
  router.get('/stores/:slug', controller.getPublicStore);
  router.get('/stores/:slug/products', controller.listPublicStoreProducts);

  // ── Products Endpoints (Merchant Self) ──
  router.post('/products', authMiddleware, controller.createProduct);
  router.get('/products', authMiddleware, controller.listOwnProducts);
  router.get('/products/:id', authMiddleware, controller.getOwnProduct);
  router.patch('/products/:id', authMiddleware, controller.updateProduct);
  router.post('/products/:id/submit', authMiddleware, controller.submitProduct);
  router.post('/products/:id/pause', authMiddleware, controller.pauseProduct);
  router.post('/products/:id/resume', authMiddleware, controller.resumeProduct);
  router.post('/products/:id/archive', authMiddleware, controller.archiveProduct);

  // ── Public Product Endpoints ──
  router.get('/products/public/:id', controller.getPublicProduct);

  // ── Admin Store Moderation Endpoints ──
  router.get('/admin/stores', authMiddleware, requireStoreModerate, controller.adminListStores);
  router.post('/admin/stores/:id/approve', authMiddleware, requireStoreModerate, controller.adminApproveStore);
  router.post('/admin/stores/:id/reject', authMiddleware, requireStoreModerate, controller.adminRejectStore);
  router.post('/admin/stores/:id/suspend', authMiddleware, requireStoreModerate, controller.adminSuspendStore);

  // ── Admin Product Moderation Endpoints ──
  router.get('/admin/products', authMiddleware, requireProductModerate, controller.adminListProducts);
  router.post('/admin/products/:id/approve', authMiddleware, requireProductModerate, controller.adminApproveProduct);
  router.post('/admin/products/:id/reject', authMiddleware, requireProductModerate, controller.adminRejectProduct);

  return router;
}

