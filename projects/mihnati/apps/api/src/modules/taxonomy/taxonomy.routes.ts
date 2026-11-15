import { Router } from 'express';
import { TaxonomyController } from './taxonomy.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';
import { PERMISSIONS } from '../admin/rbac.types.js';

export function createTaxonomyRouter(
  taxonomyController: TaxonomyController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);
  const requireCategoryManage = requirePermission(PERMISSIONS.CATEGORIES_MANAGE);

  // Public taxonomy endpoints
  router.get('/categories', taxonomyController.listCategories);
  router.get('/specialties', taxonomyController.listSpecialties);

  // Admin taxonomy endpoints
  router.get(
    '/admin/categories',
    authMiddleware,
    requireCategoryManage,
    taxonomyController.adminListCategories
  );
  router.post(
    '/admin/categories',
    authMiddleware,
    requireCategoryManage,
    taxonomyController.adminCreateCategory
  );
  router.patch(
    '/admin/categories/:id',
    authMiddleware,
    requireCategoryManage,
    taxonomyController.adminUpdateCategory
  );
  router.post(
    '/admin/specialties',
    authMiddleware,
    requireCategoryManage,
    taxonomyController.adminCreateSpecialty
  );
  router.patch(
    '/admin/specialties/:id',
    authMiddleware,
    requireCategoryManage,
    taxonomyController.adminUpdateSpecialty
  );

  return router;
}
