import { getDb } from '../../platform/database/connection.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  CommissionRuleDoc,
  CommissionSnapshotDoc,
  ProposeCommissionRuleInput,
  CommissionQuoteParams,
  CommissionQuoteDto,
  CommissionCollectionStatus,
  SubscriptionDoc,
} from './monetization.types.js';
import { randomUUID } from 'crypto';

export class CommissionsService {
  constructor(private readonly auditService: AuditService) {}

  private getRulesCol() {
    return getDb().collection<CommissionRuleDoc>('commission_rules');
  }

  private getSnapshotsCol() {
    return getDb().collection<CommissionSnapshotDoc>('commission_snapshots');
  }

  private getSubscriptionsCol() {
    return getDb().collection<SubscriptionDoc>('subscriptions');
  }

  // ══════════════════════════════════════════════════════════════
  // ── 1. Commission Rules Lifecycle & Two-Person Approval ──
  // ══════════════════════════════════════════════════════════════

  async proposeRule(
    actorId: string,
    input: ProposeCommissionRuleInput,
    requestId?: string
  ): Promise<CommissionRuleDoc> {
    if (!input.nameAr || !input.nameEn) {
      throw new ValidationError('Rule name in Arabic and English is required');
    }
    if (input.rateBps < 0 || input.rateBps > 10000) {
      throw new ValidationError('Rate basis points must be between 0 and 10000 (0% to 100%)');
    }
    if (input.fixedFeePiastres < 0) {
      throw new ValidationError('Fixed fee must be non-negative integer piastres');
    }
    if (
      input.minFeePiastres !== undefined &&
      input.maxFeePiastres !== undefined &&
      input.minFeePiastres > input.maxFeePiastres
    ) {
      throw new ValidationError('minFeePiastres cannot exceed maxFeePiastres');
    }

    const now = new Date();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : now;

    // Find latest version for this scope and category
    const categoryQuery = input.categoryId
      ? { categoryId: input.categoryId }
      : { $or: [{ categoryId: { $exists: false } }, { categoryId: null }] };

    const latest = await this.getRulesCol()
      .find({ scope: input.scope, ...categoryQuery } as any)
      .sort({ version: -1 })
      .limit(1)
      .toArray();

    const version = latest.length > 0 ? latest[0].version + 1 : 1;

    const ruleDoc: CommissionRuleDoc = {
      _id: `crule_${randomUUID()}`,
      scope: input.scope,
      categoryId: input.categoryId,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      descriptionAr: input.descriptionAr?.trim(),
      rateBps: Math.round(input.rateBps),
      fixedFeePiastres: Math.round(input.fixedFeePiastres),
      minFeePiastres: input.minFeePiastres !== undefined ? Math.round(input.minFeePiastres) : undefined,
      maxFeePiastres: input.maxFeePiastres !== undefined ? Math.round(input.maxFeePiastres) : undefined,
      effectiveFrom,
      version,
      status: 'pending_approval',
      proposedBy: actorId,
      createdAt: now,
      updatedAt: now,
    };

    await this.getRulesCol().insertOne(ruleDoc);

    await this.auditService.log({
      actorId,
      action: 'admin:commission_rule:proposed',
      targetType: 'CommissionRule',
      targetId: ruleDoc._id,
      reason: `Proposed version ${ruleDoc.version} for ${ruleDoc.scope}`,
      metadata: { scope: ruleDoc.scope, version: ruleDoc.version, rateBps: ruleDoc.rateBps },
      requestId,
    });

    return ruleDoc;
  }

  async approveRule(
    actorId: string,
    ruleId: string,
    reason: string,
    requestId?: string
  ): Promise<CommissionRuleDoc> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Detailed reason is required to approve a commission rule');
    }

    const rule = await this.getRulesCol().findOne({ _id: ruleId });
    if (!rule) {
      throw new NotFoundError('Commission rule not found');
    }

    if (rule.status !== 'pending_approval') {
      throw new ValidationError(`Rule is not in pending_approval status (current: ${rule.status})`);
    }

    // Two-person approval control (Dual control): The proposer cannot approve their own rule!
    if (rule.proposedBy === actorId) {
      throw new ForbiddenError(
        'Dual-control violation: A commission rule cannot be approved by the staff member who proposed it.'
      );
    }

    const now = new Date();

    // Find and supersede any existing active rule for this same scope and category
    const categorySupersede = rule.categoryId
      ? { categoryId: rule.categoryId }
      : { $or: [{ categoryId: { $exists: false } }, { categoryId: null }] };

    await this.getRulesCol().updateMany(
      {
        scope: rule.scope,
        status: 'active',
        _id: { $ne: ruleId },
        ...categorySupersede,
      } as any,
      {
        $set: {
          status: 'archived',
          effectiveTo: now,
          supersededBy: ruleId,
          updatedAt: now,
        },
      }
    );

    // Activate the approved rule
    await this.getRulesCol().updateOne(
      { _id: ruleId },
      {
        $set: {
          status: 'active',
          approvedBy: actorId,
          approvedAt: now,
          updatedAt: now,
        },
      }
    );

    const updated = (await this.getRulesCol().findOne({ _id: ruleId }))!;

    await this.auditService.log({
      actorId,
      action: 'admin:commission_rule:approved',
      targetType: 'CommissionRule',
      targetId: ruleId,
      reason: reason.trim(),
      metadata: { scope: rule.scope, version: rule.version, approvedBy: actorId },
      requestId,
    });

    return updated;
  }

  async archiveRule(
    actorId: string,
    ruleId: string,
    reason: string,
    requestId?: string
  ): Promise<CommissionRuleDoc> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Reason is required to archive a commission rule');
    }

    const rule = await this.getRulesCol().findOne({ _id: ruleId });
    if (!rule) {
      throw new NotFoundError('Commission rule not found');
    }

    if (rule.status === 'archived') {
      return rule;
    }

    const now = new Date();
    await this.getRulesCol().updateOne(
      { _id: ruleId },
      {
        $set: {
          status: 'archived',
          effectiveTo: now,
          updatedAt: now,
        },
      }
    );

    const updated = (await this.getRulesCol().findOne({ _id: ruleId }))!;

    await this.auditService.log({
      actorId,
      action: 'admin:commission_rule:archived',
      targetType: 'CommissionRule',
      targetId: ruleId,
      reason: reason.trim(),
      requestId,
    });

    return updated;
  }

  async listRules(filter?: {
    scope?: string;
    status?: string;
    categoryId?: string;
  }): Promise<CommissionRuleDoc[]> {
    const query: Record<string, unknown> = {};
    if (filter?.scope) query['scope'] = filter.scope;
    if (filter?.status) query['status'] = filter.status;
    if (filter?.categoryId) query['categoryId'] = filter.categoryId;

    return this.getRulesCol()
      .find(query)
      .sort({ scope: 1, categoryId: 1, version: -1 })
      .toArray();
  }

  // ══════════════════════════════════════════════════════════════
  // ── 2. Calculation & Fee Disclosure (AC-E18.2) ──
  // ══════════════════════════════════════════════════════════════

  async calculateCommissionQuote(params: CommissionQuoteParams): Promise<CommissionQuoteDto> {
    const amount = Math.max(0, Math.round(params.amountPiastres));
    const now = new Date();

    // 1. Find active rule: try specific category rule first, then scope fallback
    let rule: CommissionRuleDoc | null = null;

    if (params.categoryId) {
      rule = await this.getRulesCol().findOne({
        $and: [
          { scope: params.scope },
          { categoryId: params.categoryId },
          { status: 'active' },
          { effectiveFrom: { $lte: now } },
          {
            $or: [
              { effectiveTo: { $exists: false } },
              { effectiveTo: null },
              { effectiveTo: { $gt: now } },
            ],
          },
        ],
      } as any);
    }

    if (!rule) {
      rule = await this.getRulesCol().findOne({
        $and: [
          { scope: params.scope },
          { $or: [{ categoryId: { $exists: false } }, { categoryId: null }] },
          { status: 'active' },
          { effectiveFrom: { $lte: now } },
          {
            $or: [
              { effectiveTo: { $exists: false } },
              { effectiveTo: null },
              { effectiveTo: { $gt: now } },
            ],
          },
        ],
      } as any);
    }

    // Default system fallback rule if no custom rule configured
    const effectiveRule: CommissionRuleDoc = rule || {
      _id: 'crule_system_default',
      scope: params.scope,
      nameAr: 'العمولة الافتراضية للنظام',
      nameEn: 'System Default Commission',
      rateBps: params.scope === 'services' ? 1000 : 500, // 10% services, 5% commerce
      fixedFeePiastres: 0,
      effectiveFrom: new Date(0),
      version: 1,
      status: 'active',
      proposedBy: 'system',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };

    // 2. Check for seller subscription discounts (if applicable)
    let commissionDiscountBps = 0;
    const sellerUserId = params.scope === 'services' ? params.professionalUserId : params.merchantUserId;
    const sellerRole = params.scope === 'services' ? 'professional' : 'merchant';

    if (sellerUserId) {
      const activeSub = await this.getSubscriptionsCol().findOne({
        userId: sellerUserId,
        roleKey: sellerRole,
        status: { $in: ['trial', 'active'] },
        currentPeriodEnd: { $gt: now },
      });

      if (activeSub?.entitlements?.commissionDiscountBps) {
        commissionDiscountBps = Math.min(
          effectiveRule.rateBps,
          Math.max(0, activeSub.entitlements.commissionDiscountBps)
        );
      }
    }

    const effectiveRateBps = Math.max(0, effectiveRule.rateBps - commissionDiscountBps);

    // 3. Precise integer calculations
    const variableFeePiastres = Math.round((amount * effectiveRateBps) / 10000);
    const fixedFeePiastres = effectiveRule.fixedFeePiastres;
    let commissionAmount = variableFeePiastres + fixedFeePiastres;

    let cappedByMin = false;
    let cappedByMax = false;

    if (effectiveRule.minFeePiastres !== undefined && commissionAmount < effectiveRule.minFeePiastres) {
      commissionAmount = effectiveRule.minFeePiastres;
      cappedByMin = true;
    }
    if (effectiveRule.maxFeePiastres !== undefined && commissionAmount > effectiveRule.maxFeePiastres) {
      commissionAmount = effectiveRule.maxFeePiastres;
      cappedByMax = true;
    }

    // Commission cannot exceed the order amount
    if (commissionAmount > amount) {
      commissionAmount = amount;
    }

    const netAmountPiastres = amount - commissionAmount;

    return {
      scope: params.scope,
      orderAmountPiastres: amount,
      ruleId: effectiveRule._id,
      ruleVersion: effectiveRule.version,
      baseRateBps: effectiveRule.rateBps,
      commissionDiscountBps,
      effectiveRateBps,
      fixedFeePiastres,
      commissionAmountPiastres: commissionAmount,
      netAmountPiastres,
      currency: 'EGP',
      calculationDetails: {
        variableFeePiastres,
        fixedFeePiastres,
        cappedByMin,
        cappedByMax,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 3. Immutable Transaction Snapshots (AC-E18.1) ──
  // ══════════════════════════════════════════════════════════════

  async recordOrderCommissionSnapshot(params: {
    orderId: string;
    orderType: 'service_order' | 'merchant_order';
    amountPiastres: number;
    categoryId?: string;
    professionalUserId?: string;
    merchantUserId?: string;
  }): Promise<CommissionSnapshotDoc> {
    // Check if snapshot already exists (idempotent & immutable)
    const existing = await this.getSnapshotsCol().findOne({ orderId: params.orderId });
    if (existing) {
      return existing; // Immutable: never recalculate existing snapshot!
    }

    const scope = params.orderType === 'service_order' ? 'services' : 'commerce';
    const quote = await this.calculateCommissionQuote({
      scope,
      amountPiastres: params.amountPiastres,
      categoryId: params.categoryId,
      professionalUserId: params.professionalUserId,
      merchantUserId: params.merchantUserId,
    });

    const now = new Date();
    const snapshotDoc: CommissionSnapshotDoc = {
      _id: `csnap_${randomUUID()}`,
      orderId: params.orderId,
      orderType: params.orderType,
      ruleId: quote.ruleId,
      ruleVersion: quote.ruleVersion,
      ruleSnapshot: {
        scope,
        categoryId: params.categoryId,
        rateBps: quote.baseRateBps,
        fixedFeePiastres: quote.fixedFeePiastres,
      },
      orderAmountPiastres: quote.orderAmountPiastres,
      rateBps: quote.baseRateBps,
      fixedFeePiastres: quote.fixedFeePiastres,
      commissionDiscountBps: quote.commissionDiscountBps,
      effectiveRateBps: quote.effectiveRateBps,
      commissionAmountPiastres: quote.commissionAmountPiastres,
      netAmountPiastres: quote.netAmountPiastres,
      currency: 'EGP',
      isCollected: false,
      collectionStatus: 'pending',
      calculatedAt: now,
      version: 1,
    };

    try {
      await this.getSnapshotsCol().insertOne(snapshotDoc);
      return snapshotDoc;
    } catch (err: any) {
      if (err.code === 11000) {
        // Concurrency race: return existing snapshot
        const retry = await this.getSnapshotsCol().findOne({ orderId: params.orderId });
        if (retry) return retry;
      }
      throw err;
    }
  }

  async getOrderCommissionSnapshot(orderId: string): Promise<CommissionSnapshotDoc | null> {
    return this.getSnapshotsCol().findOne({ orderId });
  }

  async listSnapshots(filter?: {
    orderType?: string;
    collectionStatus?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ snapshots: CommissionSnapshotDoc[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter?.orderType) query['orderType'] = filter.orderType;
    if (filter?.collectionStatus) query['collectionStatus'] = filter.collectionStatus;

    const limit = Math.min(100, Math.max(1, filter?.limit || 20));
    const skip = Math.max(0, filter?.skip || 0);

    const [snapshots, total] = await Promise.all([
      this.getSnapshotsCol().find(query).sort({ calculatedAt: -1 }).skip(skip).limit(limit).toArray(),
      this.getSnapshotsCol().countDocuments(query),
    ]);

    return { snapshots, total };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 4. Collection Management (AC-E18.2: COD not presumed) ──
  // ══════════════════════════════════════════════════════════════

  async updateCollectionStatus(
    actorId: string,
    snapshotId: string,
    status: CommissionCollectionStatus,
    notes?: string,
    requestId?: string
  ): Promise<CommissionSnapshotDoc> {
    const snapshot = await this.getSnapshotsCol().findOne({ _id: snapshotId });
    if (!snapshot) {
      throw new NotFoundError('Commission snapshot not found');
    }

    const now = new Date();
    const isCollected = status === 'collected';

    await this.getSnapshotsCol().updateOne(
      { _id: snapshotId },
      {
        $set: {
          collectionStatus: status,
          isCollected,
          collectedAt: isCollected ? now : undefined,
          notes: notes ? notes.trim() : snapshot.notes,
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    const updated = (await this.getSnapshotsCol().findOne({ _id: snapshotId }))!;

    await this.auditService.log({
      actorId,
      action: 'admin:commission_snapshot:collection_updated',
      targetType: 'CommissionSnapshot',
      targetId: snapshotId,
      reason: notes || `Updated collection status to ${status}`,
      metadata: { orderId: snapshot.orderId, previousStatus: snapshot.collectionStatus, newStatus: status },
      requestId,
    });

    return updated;
  }
}
