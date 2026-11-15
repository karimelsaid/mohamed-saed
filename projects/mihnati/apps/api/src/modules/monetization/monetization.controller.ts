import type { Request, Response, NextFunction } from 'express';
import { CommissionsService } from './commissions.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';

function getRequestId(req: Request, res: Response): string {
  return (
    (res.locals['requestId'] as string) ||
    (req as any).requestId ||
    (req.headers['x-request-id'] as string) ||
    'unknown'
  );
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class MonetizationController {
  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly subscriptionsService: SubscriptionsService
  ) {}

  // ══════════════════════════════════════════════════════════════
  // ── 1. Commission Quotes & Preview (Public/Auth) ──
  // ══════════════════════════════════════════════════════════════

  getCommissionQuote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = req.query['scope'] as 'services' | 'commerce';
      const amountPiastres = Number(req.query['amountPiastres']);

      if (!scope || !['services', 'commerce'].includes(scope)) {
        throw new ValidationError('Valid scope (services or commerce) is required');
      }
      if (isNaN(amountPiastres) || amountPiastres <= 0) {
        throw new ValidationError('Valid amountPiastres is required');
      }

      const quote = await this.commissionsService.calculateCommissionQuote({
        scope,
        amountPiastres,
        categoryId: req.query['categoryId'] as string,
        professionalUserId: req.query['professionalUserId'] as string,
        merchantUserId: req.query['merchantUserId'] as string,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: quote,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── 2. Admin Commission Rules Management ──
  // ══════════════════════════════════════════════════════════════

  listCommissionRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const rules = await this.commissionsService.listRules({
        scope: req.query['scope'] as string,
        status: req.query['status'] as string,
        categoryId: req.query['categoryId'] as string,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: rules,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  proposeCommissionRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = getRequestId(req, res);

      const rule = await this.commissionsService.proposeRule(
        req.user.id,
        req.body,
        requestId
      );

      res.status(201).json({
        data: rule,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  approveCommissionRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const ruleId = getParam(req, 'id');
      const { reason } = req.body || {};
      const requestId = getRequestId(req, res);

      const rule = await this.commissionsService.approveRule(
        req.user.id,
        ruleId,
        reason,
        requestId
      );

      res.status(200).json({
        data: rule,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  archiveCommissionRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const ruleId = getParam(req, 'id');
      const { reason } = req.body || {};
      const requestId = getRequestId(req, res);

      const rule = await this.commissionsService.archiveRule(
        req.user.id,
        ruleId,
        reason,
        requestId
      );

      res.status(200).json({
        data: rule,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  listCommissionSnapshots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const limit = Number(req.query['limit']) || 20;
      const skip = Number(req.query['skip']) || 0;

      const { snapshots, total } = await this.commissionsService.listSnapshots({
        orderType: req.query['orderType'] as string,
        collectionStatus: req.query['collectionStatus'] as string,
        limit,
        skip,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: snapshots,
        pagination: {
          page: Math.floor(skip / limit) + 1,
          pageSize: limit,
          total,
          hasNext: skip + limit < total,
        },
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  updateCollectionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const snapshotId = getParam(req, 'id');
      const { status, notes } = req.body || {};
      const requestId = getRequestId(req, res);

      const snapshot = await this.commissionsService.updateCollectionStatus(
        req.user.id,
        snapshotId,
        status,
        notes,
        requestId
      );

      res.status(200).json({
        data: snapshot,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── 3. Subscription Plans & User Subscriptions ──
  // ══════════════════════════════════════════════════════════════

  listSubscriptionPlans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetRole = req.query['role'] as string;
      const plans = await this.subscriptionsService.listPlans({
        targetRole,
        activeOnly: true,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: plans,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  createSubscriptionPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = getRequestId(req, res);

      const plan = await this.subscriptionsService.createPlan(
        req.user.id,
        req.body,
        requestId
      );

      res.status(201).json({
        data: plan,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getMySubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const roleKey = (req.query['role'] as 'professional' | 'merchant') || 'professional';

      const [subscription, entitlements] = await Promise.all([
        this.subscriptionsService.getUserSubscription(req.user.id, roleKey),
        this.subscriptionsService.getUserEntitlements(req.user.id, roleKey),
      ]);

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: {
          subscription,
          entitlements,
        },
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = getRequestId(req, res);

      const result = await this.subscriptionsService.subscribeToPlan(
        req.user.id,
        req.body,
        requestId
      );

      res.status(201).json({
        data: result,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  cancelSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const subscriptionId = getParam(req, 'id');
      const { reason, immediate } = req.body || {};
      const requestId = getRequestId(req, res);

      const result = await this.subscriptionsService.cancelSubscription(
        req.user.id,
        subscriptionId,
        reason,
        immediate,
        requestId
      );

      res.status(200).json({
        data: result,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  listMyInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const invoices = await this.subscriptionsService.listUserInvoices(req.user.id);
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: invoices,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  listAdminSubscriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const limit = Number(req.query['limit']) || 20;
      const skip = Number(req.query['skip']) || 0;

      const { subscriptions, total } = await this.subscriptionsService.listAllSubscriptions({
        status: req.query['status'] as string,
        roleKey: req.query['roleKey'] as string,
        limit,
        skip,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: subscriptions,
        pagination: {
          page: Math.floor(skip / limit) + 1,
          pageSize: limit,
          total,
          hasNext: skip + limit < total,
        },
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  renewSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const subscriptionId = getParam(req, 'id');
      const { providerEventId } = req.body || {};
      const requestId = getRequestId(req, res);

      const result = await this.subscriptionsService.renewSubscription(
        subscriptionId,
        providerEventId,
        requestId
      );

      res.status(200).json({
        data: result,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };
}
