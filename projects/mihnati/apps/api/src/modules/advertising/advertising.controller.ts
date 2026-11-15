import type { Request, Response, NextFunction } from 'express';
import { AdvertisingService } from './advertising.service.js';
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

export class AdvertisingController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  // ══════════════════════════════════════════════════════════════
  // ── 1. Public Placements & Events ──
  // ══════════════════════════════════════════════════════════════

  getSponsoredPlacements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const placementContext = req.query['placement'] as
        | 'search_services'
        | 'search_products'
        | 'home_feed';

      if (!placementContext || !['search_services', 'search_products', 'home_feed'].includes(placementContext)) {
        throw new ValidationError('Valid placement context is required');
      }

      const categoryId = req.query['categoryId'] as string;
      const governorateId = req.query['governorateId'] as string;
      const limit = Number(req.query['limit']) || 3;

      const items = await this.advertisingService.getSponsoredPlacements({
        placementContext,
        categoryId,
        governorateId,
        limit,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: items,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  recordDeliveryEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId, eventType, placementContext, idempotencyKey, viewerId } = req.body || {};

      if (!campaignId || !eventType || !placementContext) {
        throw new ValidationError('campaignId, eventType, and placementContext are required');
      }
      if (!['impression', 'click'].includes(eventType)) {
        throw new ValidationError('eventType must be impression or click');
      }

      const result = await this.advertisingService.recordDeliveryEvent({
        campaignId,
        eventType,
        placementContext,
        idempotencyKey,
        viewerId,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: result,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── 2. Advertiser Portal ──
  // ══════════════════════════════════════════════════════════════

  createCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = getRequestId(req, res);

      // Derive roleKey from payload or default to professional
      const roleKey = (req.body.advertiserRole as 'professional' | 'merchant') || 'professional';

      const campaign = await this.advertisingService.createCampaign(
        req.user.id,
        roleKey,
        req.body,
        requestId
      );

      res.status(201).json({
        data: campaign,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  listMyCampaigns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const campaigns = await this.advertisingService.listAdvertiserCampaigns(req.user.id);
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: campaigns,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getCampaignMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const campaignId = getParam(req, 'id');
      const metrics = await this.advertisingService.getCampaignMetrics(
        req.user.id,
        campaignId,
        false
      );
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: metrics,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  pauseCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const campaignId = getParam(req, 'id');
      const { reason } = req.body || {};
      const requestId = getRequestId(req, res);

      const campaign = await this.advertisingService.pauseCampaign(
        req.user.id,
        campaignId,
        reason,
        requestId
      );

      res.status(200).json({
        data: campaign,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  resumeCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const campaignId = getParam(req, 'id');
      const requestId = getRequestId(req, res);

      const campaign = await this.advertisingService.resumeCampaign(
        req.user.id,
        campaignId,
        requestId
      );

      res.status(200).json({
        data: campaign,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── 3. Admin Moderation & Oversight ──
  // ══════════════════════════════════════════════════════════════

  listAdminCampaigns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const limit = Number(req.query['limit']) || 20;
      const skip = Number(req.query['skip']) || 0;

      const { campaigns, total } = await this.advertisingService.listAdminCampaigns({
        status: req.query['status'] as string,
        campaignType: req.query['campaignType'] as string,
        limit,
        skip,
      });

      const requestId = getRequestId(req, res);
      res.status(200).json({
        data: campaigns,
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

  moderateCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const campaignId = getParam(req, 'id');
      const requestId = getRequestId(req, res);

      const campaign = await this.advertisingService.moderateCampaign(
        req.user.id,
        campaignId,
        req.body,
        requestId
      );

      res.status(200).json({
        data: campaign,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };
}

