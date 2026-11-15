import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MerchantOrdersService } from './merchant-orders.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';
import type { MerchantOrderStatus } from './merchant-orders.types.js';

const reasonSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

const dispatchSchema = z.object({
  courierName: z.string().optional(),
  trackingNumber: z.string().optional(),
  dispatchNotes: z.string().optional(),
});

const markDeliveredSchema = z.object({
  proofNotes: z.string().min(3, 'Proof notes are required and must be at least 3 characters'),
  proofMediaRef: z.string().optional(),
});

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class MerchantOrdersController {
  constructor(private ordersService: MerchantOrdersService) {}

  // ══════════════════════════════════════════════════════════════
  // ── Customer Endpoints ──
  // ══════════════════════════════════════════════════════════════

  listCustomerOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const status = req.query['status'] as MerchantOrderStatus | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const orders = await this.ordersService.listCustomerOrders(req.user.id, {
        status,
        limit,
        offset,
      });

      res.json({
        data: orders,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getCustomerOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const order = await this.ordersService.getCustomerOrder(req.user.id, id);

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  confirmCustomerDelivery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const order = await this.ordersService.confirmCustomerDelivery(
        req.user.id,
        id,
        getRequestId(req)
      );

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  cancelCustomerOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = reasonSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const order = await this.ordersService.cancelOrder(
        req.user.id,
        false,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Merchant Endpoints ──
  // ══════════════════════════════════════════════════════════════

  listMerchantOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const storeId = req.query['storeId'] as string | undefined;
      const status = req.query['status'] as MerchantOrderStatus | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const orders = await this.ordersService.listMerchantOrders(req.user.id, storeId, {
        status,
        limit,
        offset,
      });

      res.json({
        data: orders,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getMerchantOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const order = await this.ordersService.getMerchantOrder(req.user.id, id);

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  revealDeliveryAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');

      // Non-cacheable headers for sensitive PII read
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const address = await this.ordersService.revealDeliveryAddress(
        req.user.id,
        id,
        getRequestId(req)
      );

      res.json({
        data: address,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  confirmOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const order = await this.ordersService.confirmOrder(req.user.id, id, getRequestId(req));

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  rejectOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = reasonSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const order = await this.ordersService.rejectOrder(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  prepareOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const order = await this.ordersService.prepareOrder(req.user.id, id, getRequestId(req));

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  readyOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const order = await this.ordersService.readyOrder(req.user.id, id, getRequestId(req));

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  dispatchOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = dispatchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const order = await this.ordersService.dispatchOrder(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  markDelivered = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = markDeliveredSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const order = await this.ordersService.markDelivered(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  cancelMerchantOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = reasonSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const order = await this.ordersService.cancelOrder(
        req.user.id,
        true,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: order,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };
}

