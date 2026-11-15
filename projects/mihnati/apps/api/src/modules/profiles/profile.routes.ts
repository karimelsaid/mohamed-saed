import { Router } from 'express';
import { ProfileController } from './profile.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createProfileRouter(
  profileController: ProfileController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // Customer profile
  router.get('/profiles/customer/me', authMiddleware, profileController.getCustomerProfile);
  router.patch('/profiles/customer/me', authMiddleware, profileController.updateCustomerProfile);

  // Professional profile
  router.get('/profiles/professional/me', authMiddleware, profileController.getProfessionalProfile);
  router.patch('/profiles/professional/me', authMiddleware, profileController.updateProfessionalProfile);

  // Merchant profile
  router.get('/profiles/merchant/me', authMiddleware, profileController.getMerchantProfile);
  router.patch('/profiles/merchant/me', authMiddleware, profileController.updateMerchantProfile);

  return router;
}

