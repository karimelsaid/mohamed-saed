import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { requirePermission } from './rbac.middleware.js';
import { PERMISSIONS } from './rbac.types.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createAdminRouter(
  adminController: AdminController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // All admin routes require authentication first
  router.use('/admin', authMiddleware);

  // ── Operational Dashboard & Queues (E17-T03) ──
  router.get(
    '/admin/dashboard/stats',
    requirePermission(PERMISSIONS.DASHBOARD_READ),
    adminController.getDashboardStats
  );
  router.get(
    '/admin/operations/queues',
    requirePermission(PERMISSIONS.DASHBOARD_READ),
    adminController.getOperationsQueues
  );

  // ── User Management (E17-T02) ──
  router.get(
    '/admin/users',
    requirePermission(PERMISSIONS.USERS_READ),
    adminController.listUsers
  );
  router.get(
    '/admin/users/:id',
    requirePermission(PERMISSIONS.USERS_READ),
    adminController.getUserDetails
  );
  router.post(
    '/admin/users/:id/suspend',
    requirePermission(PERMISSIONS.USERS_SUSPEND),
    adminController.suspendUser
  );
  router.post(
    '/admin/users/:id/unsuspend',
    requirePermission(PERMISSIONS.USERS_SUSPEND),
    adminController.unsuspendUser
  );

  // ── Staff & Role Management (E17-T02) ──
  router.get(
    '/admin/staff',
    requirePermission(PERMISSIONS.STAFF_MANAGE),
    adminController.listStaff
  );
  router.post(
    '/admin/staff',
    requirePermission(PERMISSIONS.STAFF_MANAGE),
    adminController.assignStaff
  );
  router.post(
    '/admin/roles/grant',
    requirePermission(PERMISSIONS.ROLES_GRANT),
    adminController.grantRole
  );
  router.post(
    '/admin/roles/revoke',
    requirePermission(PERMISSIONS.ROLES_REVOKE),
    adminController.revokeRole
  );

  // ── Audit Logs (E17-T01) ──
  router.get(
    '/admin/audit-logs',
    requirePermission(PERMISSIONS.AUDIT_READ),
    adminController.listAuditLogs
  );
  router.get(
    '/admin/audit-logs/export',
    requirePermission(PERMISSIONS.AUDIT_EXPORT),
    adminController.exportAuditLogs
  );

  return router;
}
