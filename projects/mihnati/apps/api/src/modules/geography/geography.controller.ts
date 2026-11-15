import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { geographyService } from './geography.service.js';
import { ValidationError, UnauthenticatedError } from '../../platform/http/errors.js';

const createAddressSchema = z.object({
  governorateId: z.string().min(1, 'Governorate ID is required'),
  localityId: z.string().min(1, 'Locality ID is required'),
  exactAddressText: z.string().min(3, 'Exact address must be at least 3 characters').max(500),
  buildingNumber: z.string().max(50).optional(),
  floor: z.string().max(50).optional(),
  apartment: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

const updateAddressSchema = z.object({
  governorateId: z.string().min(1).optional(),
  localityId: z.string().min(1).optional(),
  exactAddressText: z.string().min(3).max(500).optional(),
  buildingNumber: z.string().max(50).optional(),
  floor: z.string().max(50).optional(),
  apartment: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export class GeographyController {
  async listGovernorates(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const governorates = await geographyService.listGovernorates();
      res.json({
        success: true,
        data: governorates,
      });
    } catch (err) {
      next(err);
    }
  }

  async listLocalities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const govId = Array.isArray(req.params['govId']) ? req.params['govId'][0] : req.params['govId'];
      if (!govId) {
        throw new ValidationError('Governorate ID is required');
      }
      const parentId = typeof req.query['parentId'] === 'string' ? req.query['parentId'] : undefined;
      const type = typeof req.query['type'] === 'string' ? req.query['type'] : undefined;

      const localities = await geographyService.listLocalities({
        governorateId: govId,
        parentId,
        type,
      });

      res.json({
        success: true,
        data: localities,
      });
    } catch (err) {
      next(err);
    }
  }

  async listAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const addresses = await geographyService.listAddresses(req.user.id);
      res.json({
        success: true,
        data: addresses,
      });
    } catch (err) {
      next(err);
    }
  }

  async createAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parseResult = createAddressSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError(
          'Address validation failed',
          {
            fields: parseResult.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          }
        );
      }

      const address = await geographyService.createAddress(req.user.id, parseResult.data);
      res.status(201).json({
        success: true,
        data: address,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const addressId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!addressId) throw new ValidationError('Address ID is required');

      const parseResult = updateAddressSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError(
          'Address update validation failed',
          {
            fields: parseResult.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          }
        );
      }

      const updated = await geographyService.updateAddress(req.user.id, addressId, parseResult.data);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const addressId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!addressId) throw new ValidationError('Address ID is required');

      await geographyService.deleteAddress(req.user.id, addressId);
      res.json({
        success: true,
        data: { message: 'Address deleted successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  async setDefaultAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const addressId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!addressId) throw new ValidationError('Address ID is required');

      const updated = await geographyService.setDefault(req.user.id, addressId);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const geographyController = new GeographyController();

