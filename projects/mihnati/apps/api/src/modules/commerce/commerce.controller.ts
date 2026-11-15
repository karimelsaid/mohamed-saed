import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CommerceService } from './commerce.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';

const createAddressSchema = z.object({
  label: z.string().min(2, 'Label is required'),
  governorateId: z.string().min(1, 'Governorate is required'),
  localityId: z.string().optional(),
  addressText: z.string().min(5, 'Detailed address is required'),
  building: z.string().optional(),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  phone: z.string().min(10, 'Valid phone number is required'),
  isDefault: z.boolean().optional(),
});

const addItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

const updateQuantitySchema = z.object({
  quantity: z.number().int().min(0, 'Quantity must be non-negative'),
});

const switchStoreSchema = z.object({
  newStoreId: z.string().min(1, 'New store ID is required'),
  confirmSwitch: z.boolean({ required_error: 'Explicit confirmation is required' }),
  expectedVersion: z.number().int().min(1, 'Expected cart version is required'),
});

const checkoutQuoteSchema = z.object({
  deliveryAddressId: z.string().min(1, 'Delivery address ID is required'),
});

const checkoutSchema = z.object({
  deliveryAddressId: z.string().min(1, 'Delivery address ID is required'),
  consentToShareDeliveryAddress: z.boolean({ required_error: 'Consent is required' }),
  paymentMethod: z.literal('cash_on_delivery', {
    errorMap: () => ({ message: 'Only cash_on_delivery is supported' }),
  }),
  notes: z.string().optional(),
});

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class CommerceController {
  constructor(private commerceService: CommerceService) {}

  // ══════════════════════════════════════════════════════════════
  // ── Address Endpoints ──
  // ══════════════════════════════════════════════════════════════

  addAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = createAddressSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const address = await this.commerceService.addAddress(req.user.id, parsed.data);
      res.status(201).json({
        data: address,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  listAddresses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const addresses = await this.commerceService.listAddresses(req.user.id);
      res.json({
        data: addresses,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const address = await this.commerceService.getAddress(req.user.id, id);
      res.json({
        data: address,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Cart Endpoints (E11-T01) ──
  // ══════════════════════════════════════════════════════════════

  getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const cart = await this.commerceService.getOrCreateCart(req.user.id);
      res.json({
        data: cart,
        meta: { requestId: getRequestId(req), version: cart.version },
      });
    } catch (err) {
      next(err);
    }
  };

  addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = addItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const cart = await this.commerceService.addItemToCart(req.user.id, parsed.data);
      res.status(201).json({
        data: cart,
        meta: { requestId: getRequestId(req), version: cart.version },
      });
    } catch (err) {
      next(err);
    }
  };

  updateQuantity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const productId = getParam(req, 'productId');
      const parsed = updateQuantitySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const cart = await this.commerceService.updateItemQuantity(
        req.user.id,
        productId,
        parsed.data.quantity
      );
      res.json({
        data: cart,
        meta: { requestId: getRequestId(req), version: cart.version },
      });
    } catch (err) {
      next(err);
    }
  };

  removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const productId = getParam(req, 'productId');
      const cart = await this.commerceService.removeItem(req.user.id, productId);
      res.json({
        data: cart,
        meta: { requestId: getRequestId(req), version: cart.version },
      });
    } catch (err) {
      next(err);
    }
  };

  switchStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = switchStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const cart = await this.commerceService.switchStore(req.user.id, parsed.data);
      res.json({
        data: cart,
        meta: { requestId: getRequestId(req), version: cart.version },
      });
    } catch (err) {
      next(err);
    }
  };

  clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      await this.commerceService.clearCart(req.user.id);
      res.json({
        data: { cleared: true },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Checkout Endpoints (E11-T02) ──
  // ══════════════════════════════════════════════════════════════

  getQuote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = checkoutQuoteSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const quote = await this.commerceService.getCheckoutQuote(
        req.user.id,
        parsed.data.deliveryAddressId
      );
      res.json({
        data: quote,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  checkout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const idempotencyKey = (req.headers['idempotency-key'] as string) || '';
      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const result = await this.commerceService.checkout(
        req.user.id,
        idempotencyKey,
        parsed.data,
        getRequestId(req)
      );

      const status = result.isReplay ? 200 : 201;
      res.status(status).json({
        data: result.order,
        meta: { requestId: getRequestId(req), version: result.order.version },
      });
    } catch (err) {
      next(err);
    }
  };
}

