import type { Request, Response, NextFunction } from 'express';
import { RoleService } from './role.service.js';
import { RoleKey } from './role.types.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';
import { SuccessEnvelope } from '@mihnati/contracts';

export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  getRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const roles = await this.roleService.listUserRoles(req.user.id);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof roles> = {
        data: roles,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  activateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const rawRole = req.params['roleKey'];
      const roleKey = (Array.isArray(rawRole) ? rawRole[0] : rawRole) as RoleKey;

      if (!roleKey) {
        throw new ValidationError('roleKey parameter is required');
      }

      const result = await this.roleService.activateRole(req.user.id, roleKey);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof result.assignment> = {
        data: result.assignment,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  deactivateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }

      const rawRole = req.params['roleKey'];
      const roleKey = (Array.isArray(rawRole) ? rawRole[0] : rawRole) as RoleKey;
      const { reason } = req.body || {};

      if (!roleKey) {
        throw new ValidationError('roleKey parameter is required');
      }

      const result = await this.roleService.deactivateRole(req.user.id, roleKey, reason);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof result.assignment> = {
        data: result.assignment,
        meta: { requestId },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };
}

