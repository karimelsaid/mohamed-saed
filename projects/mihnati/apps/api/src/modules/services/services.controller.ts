import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServicesService } from './services.service.js';
import { ValidationError, UnauthenticatedError } from '../../platform/http/errors.js';

const createServiceSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  specialtyId: z.string().min(1).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(3000),
  priceType: z.enum(['fixed', 'from', 'inspection']),
  pricePiastres: z.number().int().min(0, 'Price must be non-negative integer piastres'),
  governorateId: z.string().min(1, 'Governorate is required'),
  localityId: z.string().min(1).optional(),
  media: z
    .array(
      z.object({
        fileKey: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
      })
    )
    .optional(),
});

const updateServiceSchema = z.object({
  categoryId: z.string().min(1).optional(),
  specialtyId: z.string().min(1).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(3000).optional(),
  priceType: z.enum(['fixed', 'from', 'inspection']).optional(),
  pricePiastres: z.number().int().min(0).optional(),
  governorateId: z.string().min(1).optional(),
  localityId: z.string().min(1).optional(),
  media: z
    .array(
      z.object({
        fileKey: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
      })
    )
    .optional(),
});

const moderateServiceSchema = z.object({
  decision: z.enum(['published', 'rejected']),
  notes: z.string().max(1000).optional(),
});

export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  // ── Professional Actions ──

  createDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parseResult = createServiceSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Service validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const service = await this.servicesService.createDraft(req.user.id, parseResult.data);
      res.status(201).json({ success: true, data: service });
    } catch (err) {
      next(err);
    }
  };

  updateDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Service ID is required');

      const parseResult = updateServiceSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Service update validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const updated = await this.servicesService.updateDraft(req.user.id, id, parseResult.data);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  submitForReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Service ID is required');

      const updated = await this.servicesService.submitForReview(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  pause = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Service ID is required');

      const updated = await this.servicesService.pauseService(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  resume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Service ID is required');

      const updated = await this.servicesService.resumeService(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Service ID is required');

      const updated = await this.servicesService.archiveService(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  listMyServices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const services = await this.servicesService.listMyServices(req.user.id);
      res.json({ success: true, data: services });
    } catch (err) {
      next(err);
    }
  };

  // ── Public Search ──

  searchServices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categoryId = typeof req.query['categoryId'] === 'string' ? req.query['categoryId'] : undefined;
      const specialtyId = typeof req.query['specialtyId'] === 'string' ? req.query['specialtyId'] : undefined;
      const governorateId = typeof req.query['governorateId'] === 'string' ? req.query['governorateId'] : undefined;
      const localityId = typeof req.query['localityId'] === 'string' ? req.query['localityId'] : undefined;
      const priceType = typeof req.query['priceType'] === 'string' ? (req.query['priceType'] as any) : undefined;
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;

      const minPrice = typeof req.query['minPrice'] === 'string' ? parseInt(req.query['minPrice'], 10) : undefined;
      const maxPrice = typeof req.query['maxPrice'] === 'string' ? parseInt(req.query['maxPrice'], 10) : undefined;
      const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
      const skip = typeof req.query['skip'] === 'string' ? parseInt(req.query['skip'], 10) : undefined;

      const result = await this.servicesService.searchServices({
        categoryId,
        specialtyId,
        governorateId,
        localityId,
        priceType,
        minPricePiastres: minPrice,
        maxPricePiastres: maxPrice,
        query,
        limit,
        skip,
      });

      res.json({ success: true, data: result.items, total: result.total });
    } catch (err) {
      next(err);
    }
  };

  // ── Admin Moderation ──

  adminListPending = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.servicesService.listPendingServices();
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  };

  adminModerate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Service ID is required');

      const parseResult = moderateServiceSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Moderation validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const updated = await this.servicesService.moderateService(
        id,
        req.user.id,
        parseResult.data.decision,
        parseResult.data.notes,
        requestId
      );

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };
}

