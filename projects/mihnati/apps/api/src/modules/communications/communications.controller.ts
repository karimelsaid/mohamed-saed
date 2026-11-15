import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CommunicationsService } from './communications.service.js';
import { ValidationError, UnauthenticatedError } from '../../platform/http/errors.js';

const createConversationSchema = z.object({
  contextType: z.enum(['service_request', 'service_order', 'merchant_order']),
  contextId: z.string().min(1, 'Context ID is required'),
  counterpartUserId: z.string().min(1, 'Counterpart user ID is required'),
});

const sendMessageSchema = z.object({
  text: z.string().max(2000),
  attachments: z
    .array(
      z.object({
        fileKey: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().positive().optional(),
      })
    )
    .optional(),
});

const reportSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(1000),
  messageId: z.string().optional(),
});

export class CommunicationsController {
  constructor(private commsService: CommunicationsService) {}

  // ── Conversation Handlers ──

  createConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parseResult = createConversationSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Conversation validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const conv = await this.commsService.getOrCreateConversation(
        req.user.id,
        parseResult.data.contextType,
        parseResult.data.contextId,
        parseResult.data.counterpartUserId
      );

      res.status(200).json({ success: true, data: conv });
    } catch (err) {
      next(err);
    }
  };

  listMyConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const list = await this.commsService.listMyConversations(req.user.id);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  };

  getMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Conversation ID is required');

      const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
      const skip = typeof req.query['skip'] === 'string' ? parseInt(req.query['skip'], 10) : undefined;

      const messages = await this.commsService.listMessages(req.user.id, id, limit, skip);
      res.json({ success: true, data: messages });
    } catch (err) {
      next(err);
    }
  };

  sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Conversation ID is required');

      const parseResult = sendMessageSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Message validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const msg = await this.commsService.sendMessage(req.user.id, id, parseResult.data);
      res.status(201).json({ success: true, data: msg });
    } catch (err) {
      next(err);
    }
  };

  reportConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Conversation ID is required');

      const parseResult = reportSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Report validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const report = await this.commsService.reportConversation(
        req.user.id,
        id,
        parseResult.data,
        requestId
      );

      res.status(201).json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  };

  // ── Notification Handlers ──

  listNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const unreadOnly = req.query['unreadOnly'] === 'true';
      const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
      const skip = typeof req.query['skip'] === 'string' ? parseInt(req.query['skip'], 10) : undefined;

      const result = await this.commsService.listNotifications(req.user.id, unreadOnly, limit, skip);
      res.json({ success: true, data: result.items, unreadCount: result.unreadCount });
    } catch (err) {
      next(err);
    }
  };

  markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Notification ID is required');

      await this.commsService.markNotificationAsRead(req.user.id, id);
      res.json({ success: true, data: { message: 'Notification marked as read' } });
    } catch (err) {
      next(err);
    }
  };

  markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      await this.commsService.markAllNotificationsAsRead(req.user.id);
      res.json({ success: true, data: { message: 'All notifications marked as read' } });
    } catch (err) {
      next(err);
    }
  };

  getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const unreadCount = await this.commsService.getUnreadCount(req.user.id);
      res.json({ success: true, data: { unreadCount } });
    } catch (err) {
      next(err);
    }
  };
}

