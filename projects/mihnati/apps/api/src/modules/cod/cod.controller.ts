import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CodService } from './cod.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';
import { CodDisputeOutcome, CodDisputeStatus } from './cod.types.js';

const createReportSchema = z.object({
  status: z.enum(['collected', 'not_collected'], {
    errorMap: () => ({ message: 'Status must be either "collected" or "not_collected"' }),
  }),
  amountCollectedPiastres: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
  proofRefs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const createDisputeSchema = z.object({
  disputeReason: z.string().min(5, 'Dispute reason must be at least 5 characters'),
  customerClaimedAmountPiastres: z.number().int().nonnegative().optional(),
  evidenceMediaRefs: z.array(z.string()).optional(),
});

const resolveDisputeSchema = z.object({
  resolutionOutcome: z.enum([
    'upheld_merchant',
    'upheld_customer',
    'partial_adjustment',
    'no_collection_due',
  ]),
  resolutionNotes: z.string().min(5, 'Resolution notes must be at least 5 characters'),
});

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class CodController {
  constructor(private codService: CodService) {}

  // ══════════════════════════════════════════════════════════════
  // ── Merchant Endpoints ──
  // ══════════════════════════════════════════════════════════════

  createReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const orderId = getParam(req, 'id');
      const parsed = createReportSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const report = await this.codService.createReport(
        req.user.id,
        orderId,
        parsed.data,
        getRequestId(req)
      );

      res.status(201).json({
        data: report,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  listMerchantReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const orderId = getParam(req, 'id');
      const reports = await this.codService.listOrderReports(req.user.id, true, orderId);

      res.json({
        data: reports,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Customer Endpoints ──
  // ══════════════════════════════════════════════════════════════

  listCustomerReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const orderId = getParam(req, 'id');
      const reports = await this.codService.listOrderReports(req.user.id, false, orderId);

      res.json({
        data: reports,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  openDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const orderId = getParam(req, 'id');
      const parsed = createDisputeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const dispute = await this.codService.openDispute(
        req.user.id,
        orderId,
        parsed.data,
        getRequestId(req)
      );

      res.status(201).json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  listOrderDisputes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const orderId = getParam(req, 'id');
      const disputes = await this.codService.listOrderDisputes(req.user.id, orderId);

      res.json({
        data: disputes,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Staff Dispute Management Endpoints ──
  // ══════════════════════════════════════════════════════════════

  listDisputesForStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const status = req.query['status'] as CodDisputeStatus | undefined;
      const disputes = await this.codService.listDisputesForStaff(status);

      res.json({
        data: disputes,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  assignStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const dispute = await this.codService.assignStaffToDispute(
        req.user.id,
        id,
        getRequestId(req)
      );

      res.json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  resolveDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = resolveDisputeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }

      const dispute = await this.codService.resolveDispute(
        req.user.id,
        id,
        parsed.data as { resolutionOutcome: CodDisputeOutcome; resolutionNotes: string },
        getRequestId(req)
      );

      res.json({
        data: dispute,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };
}
