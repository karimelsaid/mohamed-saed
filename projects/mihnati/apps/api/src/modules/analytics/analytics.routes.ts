import { Router } from 'express';
import { AnalyticsController } from './analytics.controller.js';
import { requirePermission } from '../admin/rbac.middleware.js';
import { PERMISSIONS } from '../admin/rbac.types.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createAnalyticsRouter(
  analyticsController: AnalyticsController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // All analytics routes require authentication
  router.use('/admin/analytics', authMiddleware);

  // KPI Summary & Metric Dictionary
  router.get(
    '/admin/analytics/metrics-dictionary',
    requirePermission(PERMISSIONS.ANALYTICS_READ),
    analyticsController.getMetricDefinitions
  );

  router.get(
    '/admin/analytics/kpis',
    requirePermission(PERMISSIONS.ANALYTICS_READ),
    analyticsController.getKpiSummary
  );

  router.get(
    '/admin/analytics/launch-readiness',
    requirePermission(PERMISSIONS.ANALYTICS_READ),
    analyticsController.getLaunchReadiness
  );

  // Replay & Rebuild (AC-E20.2)
  router.post(
    '/admin/analytics/rebuild',
    requirePermission(PERMISSIONS.ANALYTICS_READ),
    analyticsController.rebuildDailyMetrics
  );

  // Export Artifacts (AC-E20.3)
  router.post(
    '/admin/analytics/exports',
    requirePermission(PERMISSIONS.ANALYTICS_EXPORT),
    analyticsController.createExport
  );

  router.get(
    '/admin/analytics/exports/:id',
    requirePermission(PERMISSIONS.ANALYTICS_EXPORT),
    analyticsController.getExport
  );

  return router;
}

