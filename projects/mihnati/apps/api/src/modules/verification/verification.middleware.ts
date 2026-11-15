import type { Request, Response, NextFunction } from 'express';
import { VerificationService } from './verification.service.js';
import { UnauthenticatedError } from '../../platform/http/errors.js';

export function createRequireVerifiedProfessional(verificationService: VerificationService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthenticatedError();
      }
      await verificationService.assertVerifiedProfessional(req.user.id);
      next();
    } catch (err) {
      next(err);
    }
  };
}

