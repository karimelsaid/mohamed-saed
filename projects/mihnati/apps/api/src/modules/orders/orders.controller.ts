import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OrdersService } from './orders.service.js';
import { ValidationError, UnauthenticatedError } from '../../platform/http/errors.js';

const proposeAppointmentSchema = z.object({
  scheduledAt: z.string().transform((val) => new Date(val)),
  timezone: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const proposeChangeSchema = z.object({
  proposedPricePiastres: z.number().int().positive().optional(),
  proposedScopeSummary: z.string().max(500).optional(),
  reason: z.string().min(3, 'Reason is required').max(500),
});

const reasonSchema = z.object({
  reason: z.string().min(3, 'Reason is required').max(500),
});

export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  listMyOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const orders = await this.ordersService.listMyOrders(req.user.id);
      res.json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  };

  getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const order = await this.ordersService.getOrder(req.user.id, id);
      res.json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  };

  startOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const updated = await this.ordersService.startOrder(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  submitOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const updated = await this.ordersService.submitOrder(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  completeOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const updated = await this.ordersService.completeOrder(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  disputeOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const parseResult = reasonSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Dispute reason is required');
      }

      const updated = await this.ordersService.disputeOrder(req.user.id, id, parseResult.data.reason);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const parseResult = reasonSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Cancellation reason is required');
      }

      const updated = await this.ordersService.cancelOrder(req.user.id, id, parseResult.data.reason);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  // ── Appointment Handlers ──

  proposeAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const parseResult = proposeAppointmentSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Appointment validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const appt = await this.ordersService.proposeAppointment(req.user.id, id, parseResult.data);
      res.status(201).json({ success: true, data: appt });
    } catch (err) {
      next(err);
    }
  };

  confirmAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const apptId = Array.isArray(req.params['appointmentId'])
        ? req.params['appointmentId'][0]
        : req.params['appointmentId'];
      if (!apptId) throw new ValidationError('Appointment ID is required');

      const appt = await this.ordersService.confirmAppointment(req.user.id, apptId);
      res.json({ success: true, data: appt });
    } catch (err) {
      next(err);
    }
  };

  // ── Address Consent & Reveal Handlers ──

  grantAddressConsent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const updated = await this.ordersService.grantAddressConsent(
        req.user.id,
        id,
        req.ip,
        requestId
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  revokeAddressConsent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const updated = await this.ordersService.revokeAddressConsent(
        req.user.id,
        id,
        req.ip,
        requestId
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  getExecutionAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const address = await this.ordersService.getExecutionAddress(
        req.user.id,
        id,
        req.ip,
        requestId
      );
      res.json({ success: true, data: address });
    } catch (err) {
      next(err);
    }
  };

  // ── Change Requests Handlers ──

  proposeChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Order ID is required');

      const parseResult = proposeChangeSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Change request validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const change = await this.ordersService.proposeChange(req.user.id, id, parseResult.data);
      res.status(201).json({ success: true, data: change });
    } catch (err) {
      next(err);
    }
  };

  decideChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const changeId = Array.isArray(req.params['changeId'])
        ? req.params['changeId'][0]
        : req.params['changeId'];
      if (!changeId) throw new ValidationError('Change Request ID is required');

      const decision = req.body.decision;
      if (decision !== 'accepted' && decision !== 'rejected') {
        throw new ValidationError('Decision must be accepted or rejected');
      }

      const decided = await this.ordersService.decideChange(
        req.user.id,
        changeId,
        decision,
        req.body.notes
      );
      res.json({ success: true, data: decided });
    } catch (err) {
      next(err);
    }
  };
}

