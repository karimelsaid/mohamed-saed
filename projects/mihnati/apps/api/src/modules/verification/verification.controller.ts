import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { VerificationService } from './verification.service.js';
import {
  ValidationError,
  UnauthenticatedError,
} from '../../platform/http/errors.js';

const uploadDocSchema = z.object({
  type: z.enum([
    'national_id_front',
    'national_id_back',
    'criminal_record',
    'syndicate_card',
    'commercial_reg',
    'tax_card',
    'other',
  ]),
  fileKey: z.string().min(1, 'File key is required'),
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  sizeBytes: z.number().int().positive('Size must be positive'),
});

const submitCaseSchema = z.object({
  applicantNotes: z.string().max(1000).optional(),
});

const reviewDecisionSchema = z.object({
  decision: z.enum(['verified', 'rejected', 'needs_more_info']),
  reviewerDecisionNotes: z.string().min(3, 'Decision notes are required').max(1000),
});

const createPortfolioSchema = z.object({
  title: z.string().min(2, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  attachments: z
    .array(
      z.object({
        fileKey: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
      })
    )
    .optional(),
});

export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  // ── Applicant Endpoints ──

  getMyCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profileType = (req.query['profileType'] as string) || 'professional';
      if (profileType !== 'professional' && profileType !== 'merchant') {
        throw new ValidationError('Invalid profileType query parameter');
      }

      const caseData = await this.verificationService.getMyCase(req.user.id, profileType);
      res.json({ success: true, data: caseData });
    } catch (err) {
      next(err);
    }
  };

  createOrGetCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const profileType = (req.body.profileType as string) || 'professional';
      if (profileType !== 'professional' && profileType !== 'merchant') {
        throw new ValidationError('Invalid profileType');
      }

      const caseDoc = await this.verificationService.getOrCreateDraftCase(req.user.id, profileType);
      res.status(200).json({ success: true, data: caseDoc });
    } catch (err) {
      next(err);
    }
  };

  uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const caseId = Array.isArray(req.params['caseId']) ? req.params['caseId'][0] : req.params['caseId'];
      if (!caseId) throw new ValidationError('Case ID is required');

      const parseResult = uploadDocSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Document upload validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const updated = await this.verificationService.addDocument(req.user.id, caseId, parseResult.data);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  submitCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const caseId = Array.isArray(req.params['caseId']) ? req.params['caseId'][0] : req.params['caseId'];
      if (!caseId) throw new ValidationError('Case ID is required');

      const parseResult = submitCaseSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Submission validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const updated = await this.verificationService.submitForReview(
        req.user.id,
        caseId,
        parseResult.data
      );
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  // ── Portfolio Endpoints ──

  addPortfolio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parseResult = createPortfolioSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Portfolio item validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const item = await this.verificationService.addPortfolioItem(req.user.id, parseResult.data);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  };

  listMyPortfolio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const items = await this.verificationService.listPortfolioItems(req.user.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  };

  deletePortfolio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const itemId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!itemId) throw new ValidationError('Item ID is required');

      await this.verificationService.deletePortfolioItem(req.user.id, itemId);
      res.json({ success: true, data: { message: 'Portfolio item deleted successfully' } });
    } catch (err) {
      next(err);
    }
  };

  // ── Public Profile Endpoint ──

  getPublicProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = Array.isArray(req.params['slug']) ? req.params['slug'][0] : req.params['slug'];
      if (!slug) throw new ValidationError('Slug is required');

      const profile = await this.verificationService.getPublicProfileBySlug(slug);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  };

  // ── Admin Reviewer Endpoints ──

  adminListCases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query['status'] as any;
      const profileType = req.query['profileType'] as any;

      const cases = await this.verificationService.listCases({ status, profileType });
      res.json({ success: true, data: cases });
    } catch (err) {
      next(err);
    }
  };

  adminGetCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const caseId = Array.isArray(req.params['caseId']) ? req.params['caseId'][0] : req.params['caseId'];
      if (!caseId) throw new ValidationError('Case ID is required');

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const caseDoc = await this.verificationService.getCaseForReview(
        caseId,
        req.user.id,
        requestId
      );
      res.json({ success: true, data: caseDoc });
    } catch (err) {
      next(err);
    }
  };

  adminDecideCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const caseId = Array.isArray(req.params['caseId']) ? req.params['caseId'][0] : req.params['caseId'];
      if (!caseId) throw new ValidationError('Case ID is required');

      const parseResult = reviewDecisionSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Review decision validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const requestId = (req as any).requestId || (req.headers['x-request-id'] as string);
      const updated = await this.verificationService.decideCase(
        caseId,
        req.user.id,
        parseResult.data,
        requestId
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };
}
