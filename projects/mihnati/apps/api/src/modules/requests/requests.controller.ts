import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RequestsService } from './requests.service.js';
import { ValidationError, UnauthenticatedError } from '../../platform/http/errors.js';

const createRequestSchema = z.object({
  type: z.enum(['catalog', 'custom']).optional(),
  targetServiceId: z.string().min(1).optional(),
  targetProfessionalId: z.string().min(1).optional(),
  categoryId: z.string().min(1, 'Category is required'),
  specialtyId: z.string().min(1).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(3000),
  governorateId: z.string().min(1, 'Governorate is required'),
  localityId: z.string().min(1).optional(),
  exactAddressText: z.string().min(3, 'Exact address is required').max(500),
  preferredDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  budgetPiastres: z.number().int().min(0).optional(),
});

const sendOfferSchema = z.object({
  pricePiastres: z.number().int().positive('Price must be a positive integer in piastres'),
  estimatedDurationDays: z.number().int().positive().optional(),
  notes: z.string().min(3, 'Notes must be at least 3 characters').max(1000),
});

export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  // ── Customer Request Endpoints ──

  createRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parseResult = createRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Request validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const requestDoc = await this.requestsService.createRequest(req.user.id, parseResult.data);
      res.status(201).json({ success: true, data: requestDoc });
    } catch (err) {
      next(err);
    }
  };

  listMyRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const list = await this.requestsService.listMyRequests(req.user.id);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  };

  getRequestById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Request ID is required');

      const requestDoc = await this.requestsService.getRequestById(req.user.id, id);
      res.json({ success: true, data: requestDoc });
    } catch (err) {
      next(err);
    }
  };

  listOffersForRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Request ID is required');

      const offers = await this.requestsService.listOffersForRequest(req.user.id, id);
      res.json({ success: true, data: offers });
    } catch (err) {
      next(err);
    }
  };

  acceptOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      const offerId = Array.isArray(req.params['offerId']) ? req.params['offerId'][0] : req.params['offerId'];
      if (!requestId || !offerId) throw new ValidationError('Request ID and Offer ID are required');

      const order = await this.requestsService.acceptOffer(req.user.id, requestId, offerId);
      res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  };

  reopenRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Request ID is required');

      const updated = await this.requestsService.reopenRequest(req.user.id, id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  // ── Professional Opportunity Feed & Offer Endpoints ──

  getOpportunityFeed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const categoryId = typeof req.query['categoryId'] === 'string' ? req.query['categoryId'] : undefined;
      const governorateId = typeof req.query['governorateId'] === 'string' ? req.query['governorateId'] : undefined;
      const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
      const skip = typeof req.query['skip'] === 'string' ? parseInt(req.query['skip'], 10) : undefined;

      const opportunities = await this.requestsService.getOpportunityFeed(req.user.id, {
        categoryId,
        governorateId,
        limit,
        skip,
      });

      res.json({ success: true, data: opportunities });
    } catch (err) {
      next(err);
    }
  };

  sendOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!requestId) throw new ValidationError('Request ID is required');

      const parseResult = sendOfferSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Offer validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const offer = await this.requestsService.sendOffer(req.user.id, requestId, parseResult.data);
      res.status(201).json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  };

  withdrawOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const offerId = Array.isArray(req.params['offerId']) ? req.params['offerId'][0] : req.params['offerId'];
      if (!offerId) throw new ValidationError('Offer ID is required');

      const offer = await this.requestsService.withdrawOffer(req.user.id, offerId);
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  };
}

