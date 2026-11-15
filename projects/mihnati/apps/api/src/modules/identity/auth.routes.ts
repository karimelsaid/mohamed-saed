import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { createAuthMiddleware } from './auth.middleware.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

export function createAuthRouter(
  authController: AuthController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // Public authentication endpoints
  router.post('/auth/register', authController.register);
  router.post('/auth/login', authController.login);
  router.post('/auth/refresh', authController.refresh);
  router.post('/auth/otp/send', authController.sendOtp);
  router.post('/auth/otp/resend', authController.sendOtp);
  router.post('/auth/otp/verify', authController.verifyOtp);
  router.post('/auth/password/forgot', authController.forgotPassword);
  router.post('/auth/password/reset', authController.resetPassword);

  // Authenticated logout
  router.post('/auth/logout', authMiddleware, authController.logout);

  return router;
}

