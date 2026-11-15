import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  AppError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  AdCampaignDoc,
  AdDeliveryEventDoc,
  CreateCampaignInput,
  ModerateCampaignInput,
  RecordDeliveryEventInput,
  SponsoredItemDto,
  CampaignMetricsDto,
  AdCampaignStatus,
} from './advertising.types.js';
import { randomUUID } from 'crypto';

const PROHIBITED_TARGETING_KEYS = [
  'gender',
  'religion',
  'health',
  'medical',
  'biometric',
  'political',
  'ethnicity',
  'sexual_orientation',
  'income',
  'credit_score',
  'exact_location',
  'national_id',
];

export class AdvertisingService {
  constructor(private readonly auditService: AuditService) {}

  private getCampaignsCol() {
    return getDb().collection<AdCampaignDoc>('ad_campaigns');
  }

  private getEventsCol() {
    return getDb().collection<AdDeliveryEventDoc>('ad_delivery_events');
  }

  // ══════════════════════════════════════════════════════════════
  // ── 1. Campaign Setup & Eligibility (E19-T01 / AC-E19.3) ──
  // ══════════════════════════════════════════════════════════════

  async createCampaign(
    advertiserUserId: string,
    roleKey: 'professional' | 'merchant',
    input: CreateCampaignInput,
    requestId?: string
  ): Promise<AdCampaignDoc> {
    if (!input.titleAr || !input.titleEn) {
      throw new ValidationError('Campaign title in Arabic and English is required');
    }
    if (!input.targetId) {
      throw new ValidationError('targetId is required');
    }
    if (!input.budgetPiastres || input.budgetPiastres <= 0) {
      throw new ValidationError('Budget must be positive integer piastres');
    }

    const now = new Date();
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ValidationError('Valid startDate and endDate are required');
    }
    if (endDate <= startDate) {
      throw new ValidationError('endDate must be strictly after startDate');
    }

    // ── AC-E19.3: Privacy check: Prohibit sensitive personal targeting ──
    if (input.targeting) {
      const targetingKeys = Object.keys(input.targeting);
      for (const key of targetingKeys) {
        if (PROHIBITED_TARGETING_KEYS.includes(key.toLowerCase())) {
          throw new AppError(
            'SENSITIVE_TARGETING_PROHIBITED' as any,
            400,
            `Targeting by sensitive personal attribute '${key}' is strictly prohibited by platform policy.`
          );
        }
      }
    }

    // ── Verify Entity Ownership ──
    const db = getDb();
    if (input.campaignType === 'promoted_service') {
      const service = await db.collection<any>('services').findOne({
        _id: input.targetId,
        professionalUserId: advertiserUserId,
      });
      if (!service) {
        throw new NotFoundError(
          'Target service not found or does not belong to the advertiser'
        );
      }
    } else if (input.campaignType === 'promoted_store') {
      const store = await db.collection<any>('stores').findOne({
        _id: input.targetId,
        merchantUserId: advertiserUserId,
      });
      if (!store) {
        throw new NotFoundError('Target store not found or does not belong to the advertiser');
      }
    } else if (input.campaignType === 'promoted_product') {
      const product = await db.collection<any>('products').findOne({
        _id: input.targetId,
      });
      if (!product) {
        throw new NotFoundError('Target product not found');
      }
      const store = await db.collection<any>('stores').findOne({
        _id: product.storeId,
        merchantUserId: advertiserUserId,
      });
      if (!store) {
        throw new ForbiddenError('You can only promote products from your own store');
      }
    }

    const costPerImpressionPiastres = Math.max(1, Math.round(input.costPerImpressionPiastres || 20)); // 0.20 EGP default
    const costPerClickPiastres = Math.max(1, Math.round(input.costPerClickPiastres || 150)); // 1.50 EGP default

    const campaignDoc: AdCampaignDoc = {
      _id: `camp_${randomUUID()}`,
      advertiserUserId,
      advertiserRole: roleKey,
      campaignType: input.campaignType,
      targetId: input.targetId,
      titleAr: input.titleAr.trim(),
      titleEn: input.titleEn.trim(),
      descriptionAr: input.descriptionAr?.trim(),
      budgetPiastres: Math.round(input.budgetPiastres),
      spentPiastres: 0,
      costPerImpressionPiastres,
      costPerClickPiastres,
      dailyBudgetCapPiastres: input.dailyBudgetCapPiastres ? Math.round(input.dailyBudgetCapPiastres) : undefined,
      targeting: {
        governorateIds: input.targeting?.governorateIds,
        localityIds: input.targeting?.localityIds,
        categoryIds: input.targeting?.categoryIds,
      },
      startDate,
      endDate,
      status: 'pending_review',
      metrics: {
        impressionsCount: 0,
        clicksCount: 0,
      },
      billingMethod: input.billingMethod || 'prepaid_budget',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    await this.getCampaignsCol().insertOne(campaignDoc);

    await this.auditService.log({
      actorId: advertiserUserId,
      action: 'advertiser:campaign:created',
      targetType: 'AdCampaign',
      targetId: campaignDoc._id,
      reason: `Created ad campaign ${campaignDoc.titleAr}`,
      metadata: { campaignType: campaignDoc.campaignType, budgetPiastres: campaignDoc.budgetPiastres },
      requestId,
    });

    return campaignDoc;
  }

  // ══════════════════════════════════════════════════════════════
  // ── 2. Moderation & Lifecycle (E19-T01) ──
  // ══════════════════════════════════════════════════════════════

  async moderateCampaign(
    moderatorId: string,
    campaignId: string,
    input: ModerateCampaignInput,
    requestId?: string
  ): Promise<AdCampaignDoc> {
    const campaign = await this.getCampaignsCol().findOne({ _id: campaignId });
    if (!campaign) {
      throw new NotFoundError('Ad campaign not found');
    }

    if (campaign.status !== 'pending_review') {
      throw new ValidationError(`Campaign is not in pending_review status (current: ${campaign.status})`);
    }

    const now = new Date();
    let newStatus: AdCampaignStatus;
    let rejectionReason: string | undefined;

    if (input.action === 'approve') {
      newStatus = 'active';
    } else if (input.action === 'reject') {
      if (!input.reason || input.reason.trim().length === 0) {
        throw new ValidationError('A reason is required when rejecting an ad campaign');
      }
      newStatus = 'rejected';
      rejectionReason = input.reason.trim();
    } else {
      throw new ValidationError('Invalid moderation action (must be approve or reject)');
    }

    await this.getCampaignsCol().updateOne(
      { _id: campaignId },
      {
        $set: {
          status: newStatus,
          rejectionReason,
          moderatedBy: moderatorId,
          moderatedAt: now,
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    const updated = (await this.getCampaignsCol().findOne({ _id: campaignId }))!;

    await this.auditService.log({
      actorId: moderatorId,
      action: `admin:campaign:${input.action}d`,
      targetType: 'AdCampaign',
      targetId: campaignId,
      reason: input.reason || `Moderator ${input.action}d campaign`,
      metadata: { newStatus },
      requestId,
    });

    return updated;
  }

  async pauseCampaign(
    userId: string,
    campaignId: string,
    reason?: string,
    requestId?: string
  ): Promise<AdCampaignDoc> {
    const campaign = await this.getCampaignsCol().findOne({ _id: campaignId });
    if (!campaign) {
      throw new NotFoundError('Ad campaign not found');
    }
    if (campaign.advertiserUserId !== userId) {
      throw new ForbiddenError('You can only pause your own ad campaigns');
    }
    if (campaign.status !== 'active') {
      throw new ValidationError(`Campaign cannot be paused from current status: ${campaign.status}`);
    }

    const now = new Date();
    await this.getCampaignsCol().updateOne(
      { _id: campaignId },
      {
        $set: { status: 'paused', updatedAt: now },
        $inc: { version: 1 },
      }
    );

    const updated = (await this.getCampaignsCol().findOne({ _id: campaignId }))!;

    await this.auditService.log({
      actorId: userId,
      action: 'advertiser:campaign:paused',
      targetType: 'AdCampaign',
      targetId: campaignId,
      reason: reason || 'Advertiser paused campaign',
      requestId,
    });

    return updated;
  }

  async resumeCampaign(
    userId: string,
    campaignId: string,
    requestId?: string
  ): Promise<AdCampaignDoc> {
    const campaign = await this.getCampaignsCol().findOne({ _id: campaignId });
    if (!campaign) {
      throw new NotFoundError('Ad campaign not found');
    }
    if (campaign.advertiserUserId !== userId) {
      throw new ForbiddenError('You can only resume your own ad campaigns');
    }
    if (campaign.status !== 'paused') {
      throw new ValidationError(`Only paused campaigns can be resumed (current: ${campaign.status})`);
    }

    const now = new Date();
    if (campaign.endDate <= now) {
      throw new ValidationError('Campaign endDate has already passed');
    }
    if (campaign.spentPiastres >= campaign.budgetPiastres) {
      throw new ValidationError('Campaign budget is already exhausted');
    }

    await this.getCampaignsCol().updateOne(
      { _id: campaignId },
      {
        $set: { status: 'active', updatedAt: now },
        $inc: { version: 1 },
      }
    );

    const updated = (await this.getCampaignsCol().findOne({ _id: campaignId }))!;

    await this.auditService.log({
      actorId: userId,
      action: 'advertiser:campaign:resumed',
      targetType: 'AdCampaign',
      targetId: campaignId,
      reason: 'Advertiser resumed campaign',
      requestId,
    });

    return updated;
  }

  // ══════════════════════════════════════════════════════════════
  // ── 3. Delivery & Placement with Visible Labeling (AC-E19.1 / AC-E19.2) ──
  // ══════════════════════════════════════════════════════════════

  async getSponsoredPlacements(context: {
    placementContext: 'search_services' | 'search_products' | 'home_feed';
    categoryId?: string;
    governorateId?: string;
    limit?: number;
  }): Promise<SponsoredItemDto[]> {
    const now = new Date();
    const limit = Math.min(10, Math.max(1, context.limit || 3));

    let campaignType: string;
    if (context.placementContext === 'search_services') {
      campaignType = 'promoted_service';
    } else if (context.placementContext === 'search_products') {
      campaignType = 'promoted_product';
    } else {
      campaignType = 'promoted_store';
    }

    // AC-E19.2: Only active, currently running, non-exhausted campaigns can display!
    const query: Record<string, unknown> = {
      campaignType,
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ['$spentPiastres', '$budgetPiastres'] },
    };

    if (context.categoryId) {
      query['$or'] = [
        { 'targeting.categoryIds': { $exists: false } },
        { 'targeting.categoryIds': { $size: 0 } },
        { 'targeting.categoryIds': context.categoryId },
      ];
    }

    const campaigns = await this.getCampaignsCol()
      .find(query as any)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    if (campaigns.length === 0) {
      return [];
    }

    const db = getDb();
    const results: SponsoredItemDto[] = [];

    for (const camp of campaigns) {
      let item: Record<string, unknown> | null = null;

      if (camp.campaignType === 'promoted_service') {
        item = (await db.collection<any>('services').findOne({ _id: camp.targetId })) as Record<string, unknown> | null;
      } else if (camp.campaignType === 'promoted_store') {
        item = (await db.collection<any>('stores').findOne({ _id: camp.targetId })) as Record<string, unknown> | null;
      } else if (camp.campaignType === 'promoted_product') {
        item = (await db.collection<any>('products').findOne({ _id: camp.targetId })) as Record<string, unknown> | null;
      }

      if (item) {
        // AC-E19.1: Visibly and contractually labeled everywhere!
        results.push({
          campaignId: camp._id,
          targetType: camp.campaignType,
          targetId: camp.targetId,
          item,
          isSponsored: true,
          sponsorLabelAr: 'إعلان ممول',
          sponsorLabelEn: 'Sponsored',
        });
      }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // ── 4. Delivery Events & Atomic Budget Cap (AC-E19.2) ──
  // ══════════════════════════════════════════════════════════════

  async recordDeliveryEvent(
    input: RecordDeliveryEventInput
  ): Promise<{ recorded: boolean; costPiastres: number; campaignStatus: AdCampaignStatus }> {
    const campaign = await this.getCampaignsCol().findOne({ _id: input.campaignId });
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Idempotency: if this event was already recorded, deduplicate to prevent double-charging (AC-E19.2)
    if (input.idempotencyKey) {
      const existing = await this.getEventsCol().findOne({
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) {
        return {
          recorded: true,
          costPiastres: existing.costPiastres,
          campaignStatus: campaign.status,
        };
      }
    }

    // Check if campaign is active and has budget
    if (campaign.status !== 'active' || campaign.spentPiastres >= campaign.budgetPiastres) {
      return {
        recorded: false,
        costPiastres: 0,
        campaignStatus: campaign.status === 'active' ? 'completed' : campaign.status,
      };
    }

    const costPiastres =
      input.eventType === 'impression'
        ? campaign.costPerImpressionPiastres
        : campaign.costPerClickPiastres;

    const metricField =
      input.eventType === 'impression'
        ? 'metrics.impressionsCount'
        : 'metrics.clicksCount';

    // Atomic CAS update: only increment if spent + cost does not exceed budget
    const updateResult = await this.getCampaignsCol().updateOne(
      {
        _id: input.campaignId,
        status: 'active',
        $expr: { $lte: [{ $add: ['$spentPiastres', costPiastres] }, '$budgetPiastres'] },
      } as any,
      {
        $inc: {
          spentPiastres: costPiastres,
          [metricField]: 1,
        },
        $set: { updatedAt: new Date() },
      }
    );

    if (updateResult.matchedCount === 0) {
      // Budget cap reached: mark completed
      await this.getCampaignsCol().updateOne(
        { _id: input.campaignId },
        { $set: { status: 'completed', updatedAt: new Date() } }
      );
      return {
        recorded: false,
        costPiastres: 0,
        campaignStatus: 'completed',
      };
    }

    // Check if budget is now exhausted
    const updated = await this.getCampaignsCol().findOne({ _id: input.campaignId });
    let finalStatus: AdCampaignStatus = campaign.status;

    if (updated && updated.spentPiastres >= updated.budgetPiastres) {
      await this.getCampaignsCol().updateOne(
        { _id: input.campaignId },
        { $set: { status: 'completed', updatedAt: new Date() } }
      );
      finalStatus = 'completed';
    }

    const now = new Date();
    const eventDoc: AdDeliveryEventDoc = {
      _id: `adev_${randomUUID()}`,
      campaignId: input.campaignId,
      eventType: input.eventType,
      placementContext: input.placementContext,
      costPiastres,
      idempotencyKey: input.idempotencyKey,
      pseudonymizedViewerId: input.viewerId,
      recordedAt: now,
    };

    await this.getEventsCol().insertOne(eventDoc);

    return {
      recorded: true,
      costPiastres,
      campaignStatus: finalStatus,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 5. Metrics & Reporting ──
  // ══════════════════════════════════════════════════════════════

  async getCampaignMetrics(
    userId: string,
    campaignId: string,
    isAdmin = false
  ): Promise<CampaignMetricsDto> {
    const campaign = await this.getCampaignsCol().findOne({ _id: campaignId });
    if (!campaign) {
      throw new NotFoundError('Ad campaign not found');
    }

    if (!isAdmin && campaign.advertiserUserId !== userId) {
      throw new ForbiddenError('You can only view metrics for your own campaigns');
    }

    const remainingBudgetPiastres = Math.max(0, campaign.budgetPiastres - campaign.spentPiastres);
    const impressions = campaign.metrics.impressionsCount || 0;
    const clicks = campaign.metrics.clicksCount || 0;
    const clickThroughRatePercent =
      impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;

    return {
      campaignId: campaign._id,
      status: campaign.status,
      budgetPiastres: campaign.budgetPiastres,
      spentPiastres: campaign.spentPiastres,
      remainingBudgetPiastres,
      impressionsCount: impressions,
      clicksCount: clicks,
      clickThroughRatePercent,
      isBudgetExhausted: campaign.spentPiastres >= campaign.budgetPiastres,
      isActive: campaign.status === 'active',
    };
  }

  async listAdvertiserCampaigns(userId: string): Promise<AdCampaignDoc[]> {
    return this.getCampaignsCol().find({ advertiserUserId: userId }).sort({ createdAt: -1 }).toArray();
  }

  async listAdminCampaigns(filter?: {
    status?: string;
    campaignType?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ campaigns: AdCampaignDoc[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter?.status) query['status'] = filter.status;
    if (filter?.campaignType) query['campaignType'] = filter.campaignType;

    const limit = Math.min(100, Math.max(1, filter?.limit || 20));
    const skip = Math.max(0, filter?.skip || 0);

    const [campaigns, total] = await Promise.all([
      this.getCampaignsCol().find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      this.getCampaignsCol().countDocuments(query),
    ]);

    return { campaigns, total };
  }
}
