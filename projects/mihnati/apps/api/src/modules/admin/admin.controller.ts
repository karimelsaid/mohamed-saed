import type { Request, Response, NextFunction } from 'express';
import { AuditService } from './audit.service.js';
import { AdminService } from './admin.service.js';
import { getDb } from '../../platform/database/connection.js';
import { RoleAssignmentDoc } from '../roles/role.types.js';
import { UserDoc } from '../identity/auth.types.js';
import { SessionService } from '../identity/session.service.js';
import { NotFoundError, ValidationError, ForbiddenError, UnauthenticatedError } from '../../platform/http/errors.js';
import { SuccessEnvelope, ListEnvelope } from '@mihnati/contracts';
import { randomUUID } from 'crypto';

function getRequestId(req: Request, res: Response): string {
  return (res.locals['requestId'] as string) || (req as any).requestId || (req.headers['x-request-id'] as string) || 'unknown';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class AdminController {
  constructor(
    private readonly auditService: AuditService,
    private readonly sessionService: SessionService,
    private readonly adminService?: AdminService
  ) {}

  // ══════════════════════════════════════════════════════════════
  // ── 1. Audit Logs (E17-T01) ──
  // ══════════════════════════════════════════════════════════════

  listAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const page = Math.max(Number(req.query['page']) || 1, 1);
      const pageSize = Math.min(Math.max(Number(req.query['pageSize']) || 25, 1), 100);
      const skip = (page - 1) * pageSize;

      const { logs, total } = await this.auditService.listLogs({
        actorId: req.query['actorId'] as string,
        targetType: req.query['targetType'] as string,
        limit: pageSize,
        skip,
      });

      const requestId = getRequestId(req, res);

      // Sensitive access itself is audited
      await this.auditService.log({
        actorId: req.user.id,
        action: 'admin:audit_logs:read',
        targetType: 'AdminAuditLogs',
        targetId: 'all',
        sensitivePurpose: 'Audit review',
        requestId,
      });

      const response: ListEnvelope<typeof logs[0]> = {
        data: logs,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: page * pageSize < total,
        },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  exportAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const requestId = getRequestId(req, res);
      const exportData = await this.adminService.exportAuditLogs(
        req.user.id,
        {
          startDate: req.query['startDate'] as string,
          endDate: req.query['endDate'] as string,
          actorId: req.query['actorId'] as string,
          targetType: req.query['targetType'] as string,
        },
        requestId
      );

      res.status(200).json({
        data: exportData,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── 2. User & Staff Management (E17-T02) ──
  // ══════════════════════════════════════════════════════════════

  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const page = Math.max(Number(req.query['page']) || 1, 1);
      const pageSize = Math.min(Math.max(Number(req.query['pageSize']) || 20, 1), 100);

      const { users, total } = await this.adminService.listUsers({
        search: req.query['search'] as string,
        status: req.query['status'] as string,
        role: req.query['role'] as string,
        page,
        pageSize,
      });

      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: users,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: page * pageSize < total,
        },
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getUserDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const userId = getParam(req, 'id');
      const details = await this.adminService.getUserDetails(userId);
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: details,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  suspendUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const targetUserId = getParam(req, 'id');
      const { reason } = req.body || {};
      if (!reason) throw new ValidationError('Reason is required for account suspension');

      // Self-action guard: Administrators cannot suspend themselves
      if (req.user.id === targetUserId) {
        throw new ForbiddenError('Administrators cannot suspend their own account.');
      }

      const db = getDb();
      const usersCol = db.collection<UserDoc>('users');
      const user = await usersCol.findOne({ _id: targetUserId });
      if (!user) throw new NotFoundError('Target user not found');

      const now = new Date();
      await usersCol.updateOne(
        { _id: targetUserId },
        {
          $set: { status: 'suspended', updatedAt: now },
          $inc: { version: 1 },
        }
      );

      // Revoke all sessions immediately (AC-E02.3)
      await this.sessionService.revokeAllUserSessions(targetUserId, 'ADMIN_SUSPEND');

      const requestId = getRequestId(req, res);

      // Audit log
      await this.auditService.log({
        actorId: req.user.id,
        action: 'admin:users:suspend',
        targetType: 'UserAccount',
        targetId: targetUserId,
        reason,
        requestId,
      });

      const response: SuccessEnvelope<{ status: string }> = {
        data: { status: 'suspended' },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  unsuspendUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const targetUserId = getParam(req, 'id');
      const { reason } = req.body || {};
      const requestId = getRequestId(req, res);

      const result = await this.adminService.unsuspendUser(
        req.user.id,
        targetUserId,
        reason,
        requestId
      );

      res.status(200).json({
        data: result,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  grantRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const { targetUserId, roleKey, reason } = req.body;
      if (!targetUserId || !roleKey || !reason) {
        throw new ValidationError('targetUserId, roleKey, and reason are required');
      }

      const db = getDb();
      const user = await db.collection<UserDoc>('users').findOne({ _id: targetUserId });
      if (!user) throw new NotFoundError('Target user not found');

      const col = db.collection<RoleAssignmentDoc>('user_role_assignments');
      const now = new Date();
      await col.updateOne(
        { userId: targetUserId, roleKey },
        {
          $set: {
            status: 'active',
            grantedBy: req.user.id,
            grantedAt: now,
            reason,
            updatedAt: now,
          },
          $setOnInsert: {
            _id: `ura_${randomUUID()}`,
            userId: targetUserId,
            roleKey,
            createdAt: now,
          },
        },
        { upsert: true }
      );

      const requestId = getRequestId(req, res);

      // Audit log
      await this.auditService.log({
        actorId: req.user.id,
        action: 'admin:roles:grant',
        targetType: 'UserRoleAssignment',
        targetId: targetUserId,
        reason,
        metadata: { roleKey },
        requestId,
      });

      const response: SuccessEnvelope<{ granted: boolean }> = {
        data: { granted: true },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  revokeRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const { targetUserId, roleKey, reason } = req.body;
      if (!targetUserId || !roleKey || !reason) {
        throw new ValidationError('targetUserId, roleKey, and reason are required');
      }

      // Self-action guard: Admin cannot revoke their own admin role
      if (req.user.id === targetUserId && roleKey === 'admin') {
        throw new ForbiddenError('Administrators cannot revoke their own admin privileges.');
      }

      const db = getDb();
      const col = db.collection<RoleAssignmentDoc>('user_role_assignments');
      const now = new Date();
      const result = await col.updateOne(
        { userId: targetUserId, roleKey, status: 'active' },
        {
          $set: {
            status: 'inactive',
            revokedAt: now,
            reason,
            updatedAt: now,
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new NotFoundError('Active role assignment not found for target user');
      }

      // If revoking admin or support, revoke all sessions
      if (roleKey === 'admin' || roleKey === 'support') {
        await this.sessionService.revokeAllUserSessions(targetUserId, 'ADMIN_ROLE_REVOKED');
      }

      const requestId = getRequestId(req, res);

      // Audit log
      await this.auditService.log({
        actorId: req.user.id,
        action: 'admin:roles:revoke',
        targetType: 'UserRoleAssignment',
        targetId: targetUserId,
        reason,
        metadata: { roleKey },
        requestId,
      });

      const response: SuccessEnvelope<{ revoked: boolean }> = {
        data: { revoked: true },
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  listStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const page = Math.max(Number(req.query['page']) || 1, 1);
      const pageSize = Math.min(Math.max(Number(req.query['pageSize']) || 20, 1), 100);

      const { staff, total } = await this.adminService.listStaff({ page, pageSize });
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: staff,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: page * pageSize < total,
        },
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  assignStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const requestId = getRequestId(req, res);
      const staff = await this.adminService.assignStaff(
        req.user.id,
        req.body,
        requestId
      );

      res.status(200).json({
        data: staff,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── 3. Operational Dashboard & Queues (E17-T03) ──
  // ══════════════════════════════════════════════════════════════

  getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const stats = await this.adminService.getDashboardStats();
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: stats,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getOperationsQueues = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      if (!this.adminService) throw new Error('AdminService not configured');

      const queues = await this.adminService.getOperationsQueues();
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: queues,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };
}
