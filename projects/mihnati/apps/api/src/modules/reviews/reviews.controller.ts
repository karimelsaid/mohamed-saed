import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ReviewsService } from './reviews.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';
import { ReviewStatus } from './reviews.types.js';

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3, 'Review comment must be at least 3 characters'),
});

const reviewResponseSchema = z.object({
  comment: z.string().min(3, 'Response must be at least 3 characters'),
});

const moderateReviewSchema = z.object({
  action: z.enum(['hide', 'restore', 'remove']),
  reason: z.string().min(3, 'Detailed moderation reason is required'),
});

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  createServiceOrderReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = createReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const review = await this.reviewsService.createServiceOrderReview(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.status(201).json({
        data: review,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  createMerchantOrderReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = createReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const review = await this.reviewsService.createMerchantOrderReview(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.status(201).json({
        data: review,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  respondToReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = reviewResponseSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const review = await this.reviewsService.respondToReview(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: review,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  listTargetReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = (req.query['targetId'] as string) || '';
      if (!targetId) {
        throw new ValidationError('Query parameter "targetId" is required');
      }

      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const result = await this.reviewsService.listTargetReviews(targetId, { limit, offset });

      res.json({
        data: result.reviews,
        summary: result.summary,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  listAdminReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const status = req.query['status'] as ReviewStatus | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const reviews = await this.reviewsService.listAdminReviews({ status, limit, offset });

      res.json({
        data: reviews,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  moderateReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = moderateReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const review = await this.reviewsService.moderateReview(
        req.user.id,
        id,
        parsed.data,
        getRequestId(req)
      );

      res.json({
        data: review,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };
}

