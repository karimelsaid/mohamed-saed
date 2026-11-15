import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';

const adjustInventorySchema = z.object({
  type: z.enum(['restock', 'damage', 'shrinkage', 'audit_correction'], {
    errorMap: () => ({ message: 'Invalid adjustment type' }),
  }),
  quantity: z.number().int('Quantity must be an integer'),
  reason: z.string().min(3, 'Detailed reason is required'),
});

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  getStockProjection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req, 'id');
      const projection = await this.inventoryService.getStockProjection(id);
      res.json({
        data: projection,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adjustInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = adjustInventorySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const projection = await this.inventoryService.adjustInventory(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.status(200).json({
        data: projection,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  listMovements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const movements = await this.inventoryService.listMovements(req.user.id, id);
      res.json({
        data: movements,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  expireStaleReservations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await this.inventoryService.expireStaleReservations();
      res.json({
        data: { expiredCount: count },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };
}

