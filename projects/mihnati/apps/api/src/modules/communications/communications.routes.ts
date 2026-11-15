import { Router } from 'express';
import { CommunicationsController } from './communications.controller.js';
import { createAuthMiddleware } from '../identity/auth.middleware.js';
import { AuthService } from '../identity/auth.service.js';
import { SessionService } from '../identity/session.service.js';

export function createCommunicationsRouter(
  controller: CommunicationsController,
  sessionService: SessionService,
  authService: AuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(sessionService, authService);

  // ── Conversations & Messages (AC-E09.1) ──
  router.post('/conversations', authMiddleware, controller.createConversation);
  router.get('/conversations/me', authMiddleware, controller.listMyConversations);
  router.get('/conversations/:id/messages', authMiddleware, controller.getMessages);
  router.post('/conversations/:id/messages', authMiddleware, controller.sendMessage);
  router.post('/conversations/:id/report', authMiddleware, controller.reportConversation);

  // ── In-App Notifications (AC-E09.2) ──
  router.get('/notifications', authMiddleware, controller.listNotifications);
  router.get('/notifications/unread-count', authMiddleware, controller.getUnreadCount);
  router.post('/notifications/:id/read', authMiddleware, controller.markAsRead);
  router.post('/notifications/read-all', authMiddleware, controller.markAllAsRead);

  return router;
}

