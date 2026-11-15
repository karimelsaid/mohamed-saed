import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../../platform/database/connection.js';
import { RoleAssignmentDoc } from '../roles/role.types.js';
import { PermissionKey, ROLE_PERMISSIONS_MAP } from './rbac.types.js';
import { ForbiddenError, UnauthenticatedError } from '../../platform/http/errors.js';

/**
 * RBAC authorization middleware (deny-by-default).
 * Derives user permissions from active role assignments in user_role_assignments.
 */
export function requirePermission(permission: PermissionKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const col = getDb().collection<RoleAssignmentDoc>('user_role_assignments');
      const assignments = await col
        .find({ userId: req.user.id, status: 'active' })
        .toArray();

      const userPermissions = new Set<string>();
      for (const assignment of assignments) {
        const perms = ROLE_PERMISSIONS_MAP[assignment.roleKey] || [];
        for (const p of perms) {
          userPermissions.add(p);
        }
      }

      if (!userPermissions.has(permission)) {
        throw new ForbiddenError(`Access denied: required permission "${permission}" is not granted.`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

