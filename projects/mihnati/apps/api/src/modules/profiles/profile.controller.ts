import type { Request, Response, NextFunction } from 'express';
import { ProfileService } from './profile.service.js';
import { UnauthenticatedError } from '../../platform/http/errors.js';
import { SuccessEnvelope } from '@mihnati/contracts';

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  getCustomerProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profile = await this.profileService.getCustomerProfile(req.user.id);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof profile> = {
        data: profile,
        meta: { requestId },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  updateCustomerProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profile = await this.profileService.updateCustomerProfile(req.user.id, req.body);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof profile> = {
        data: profile,
        meta: { requestId },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  getProfessionalProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profile = await this.profileService.getProfessionalProfile(req.user.id);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof profile> = {
        data: profile,
        meta: { requestId },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  updateProfessionalProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profile = await this.profileService.updateProfessionalProfile(req.user.id, req.body);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof profile> = {
        data: profile,
        meta: { requestId },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  getMerchantProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profile = await this.profileService.getMerchantProfile(req.user.id);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof profile> = {
        data: profile,
        meta: { requestId },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  updateMerchantProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profile = await this.profileService.updateMerchantProfile(req.user.id, req.body);
      const requestId = (res.locals['requestId'] as string) || 'unknown';

      const response: SuccessEnvelope<typeof profile> = {
        data: profile,
        meta: { requestId },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };
}

