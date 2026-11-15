import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  AppError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  SubscriptionPlanDoc,
  SubscriptionDoc,
  SubscriptionInvoiceDoc,
  CreateSubscriptionPlanInput,
  SubscribeInput,
  SubscriptionFeatures,
} from './monetization.types.js';
import { randomUUID } from 'crypto';

const DEFAULT_FREE_ENTITLEMENTS: SubscriptionFeatures = {
  maxListings: 5,
  commissionDiscountBps: 0,
  priorityPlacement: false,
  verifiedBadge: false,
  analyticsAccess: false,
};

export class SubscriptionsService {
  constructor(private readonly auditService: AuditService) {}

  private getPlansCol() {
    return getDb().collection<SubscriptionPlanDoc>('subscription_plans');
  }

  private getSubscriptionsCol() {
    return getDb().collection<SubscriptionDoc>('subscriptions');
  }

  private getInvoicesCol() {
    return getDb().collection<SubscriptionInvoiceDoc>('subscription_invoices');
  }

  // ══════════════════════════════════════════════════════════════
  // ── 1. Subscription Plans (E18-T02) ──
  // ══════════════════════════════════════════════════════════════

  async createPlan(
    actorId: string,
    input: CreateSubscriptionPlanInput,
    requestId?: string
  ): Promise<SubscriptionPlanDoc> {
    if (!input.planCode || !input.nameAr || !input.nameEn) {
      throw new ValidationError('planCode, nameAr, and nameEn are required');
    }
    if (input.pricePiastres < 0) {
      throw new ValidationError('Price must be non-negative integer piastres');
    }
    if (input.durationDays <= 0) {
      throw new ValidationError('Duration must be at least 1 day');
    }

    const existing = await this.getPlansCol().findOne({ planCode: input.planCode });
    if (existing) {
      throw new ConflictError(`Subscription plan with code ${input.planCode} already exists`);
    }

    const now = new Date();
    const planDoc: SubscriptionPlanDoc = {
      _id: `plan_${randomUUID()}`,
      planCode: input.planCode.trim(),
      targetRole: input.targetRole,
      tier: input.tier,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      descriptionAr: input.descriptionAr.trim(),
      pricePiastres: Math.round(input.pricePiastres),
      billingInterval: input.billingInterval,
      durationDays: Math.round(input.durationDays),
      features: input.features || {},
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.getPlansCol().insertOne(planDoc);

    await this.auditService.log({
      actorId,
      action: 'admin:subscription_plan:created',
      targetType: 'SubscriptionPlan',
      targetId: planDoc._id,
      reason: `Created subscription plan ${planDoc.planCode}`,
      metadata: { planCode: planDoc.planCode, pricePiastres: planDoc.pricePiastres },
      requestId,
    });

    return planDoc;
  }

  async listPlans(filter?: {
    targetRole?: string;
    activeOnly?: boolean;
  }): Promise<SubscriptionPlanDoc[]> {
    const query: Record<string, unknown> = {};
    if (filter?.targetRole) query['targetRole'] = filter.targetRole;
    if (filter?.activeOnly !== false) query['isActive'] = true;

    return this.getPlansCol().find(query).sort({ pricePiastres: 1 }).toArray();
  }

  async getPlanByCode(planCode: string): Promise<SubscriptionPlanDoc | null> {
    return this.getPlansCol().findOne({ planCode });
  }

  // ══════════════════════════════════════════════════════════════
  // ── 2. Subscription Lifecycle & Billing Gate (AC-E18.2 / AC-E18.3) ──
  // ══════════════════════════════════════════════════════════════

  async subscribeToPlan(
    userId: string,
    input: SubscribeInput,
    requestId?: string
  ): Promise<{ subscription: SubscriptionDoc; invoice: SubscriptionInvoiceDoc }> {
    const plan = await this.getPlansCol().findOne({ planCode: input.planCode, isActive: true });
    if (!plan) {
      throw new NotFoundError(`Active subscription plan ${input.planCode} not found`);
    }

    if (plan.targetRole !== input.roleKey) {
      throw new ValidationError(
        `Plan ${input.planCode} is for role ${plan.targetRole}, not for ${input.roleKey}`
      );
    }

    const now = new Date();

    // Check if user already has an active subscription for this role
    const activeSub = await this.getSubscriptionsCol().findOne({
      userId,
      roleKey: input.roleKey,
      status: { $in: ['trial', 'active'] },
      currentPeriodEnd: { $gt: now },
    });

    if (activeSub) {
      if (activeSub.planCode === input.planCode) {
        throw new ConflictError(
          'User already has an active subscription to this plan',
          'DUPLICATE_SUBSCRIPTION' as any
        );
      }
      // If upgrading or changing plan, cancel current sub at now
      await this.getSubscriptionsCol().updateOne(
        { _id: activeSub._id },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: now,
            cancellationReason: `Upgraded to ${input.planCode}`,
            updatedAt: now,
          },
          $inc: { version: 1 },
        }
      );
    }

    // ── Electronic Billing Gate (AC-E18.2) ──
    // Paid plans require an approved provider event / webhook reference.
    // If price > 0 and no provider reference, billing gate fails closed.
    const isPaid = plan.pricePiastres > 0;
    if (isPaid && !input.providerEventId) {
      throw new AppError(
        'BILLING_GATE_CLOSED' as any,
        400,
        'Electronic billing gate is closed. Paid subscriptions require approved payment provider event.'
      );
    }

    // Idempotency: if providerEventId provided, ensure it was not previously used
    if (input.providerEventId) {
      const existingInvoice = await this.getInvoicesCol().findOne({
        providerEventId: input.providerEventId,
      });
      if (existingInvoice) {
        const sub = await this.getSubscriptionsCol().findOne({ _id: existingInvoice.subscriptionId });
        if (sub) {
          return { subscription: sub, invoice: existingInvoice };
        }
      }
    }

    const periodStart = now;
    const periodEnd = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const subscriptionId = `sub_${randomUUID()}`;
    const invoiceNumber = `INV-${now.getUTCFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const invoiceDoc: SubscriptionInvoiceDoc = {
      _id: `sinv_${randomUUID()}`,
      invoiceNumber,
      subscriptionId,
      userId,
      planId: plan._id,
      amountPiastres: plan.pricePiastres,
      currency: 'EGP',
      status: 'paid',
      billingReason: activeSub ? 'subscription_upgrade' : 'subscription_create',
      paymentMethod: isPaid ? 'provider' : 'free_grant',
      providerEventId: input.providerEventId,
      periodStart,
      periodEnd,
      paidAt: now,
      createdAt: now,
    };

    const subscriptionDoc: SubscriptionDoc = {
      _id: subscriptionId,
      userId,
      roleKey: input.roleKey,
      planId: plan._id,
      planCode: plan.planCode,
      tier: plan.tier,
      status: plan.tier === 'free' ? 'active' : isPaid ? 'active' : 'trial',
      startedAt: now,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      autoRenew: input.autoRenew ?? true,
      entitlements: plan.features || DEFAULT_FREE_ENTITLEMENTS,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    await this.getInvoicesCol().insertOne(invoiceDoc);
    await this.getSubscriptionsCol().insertOne(subscriptionDoc);

    await this.auditService.log({
      actorId: userId,
      action: 'user:subscription:subscribed',
      targetType: 'Subscription',
      targetId: subscriptionId,
      reason: `Subscribed to plan ${plan.planCode}`,
      metadata: { planCode: plan.planCode, pricePiastres: plan.pricePiastres, invoiceNumber },
      requestId,
    });

    return { subscription: subscriptionDoc, invoice: invoiceDoc };
  }

  async cancelSubscription(
    userId: string,
    subscriptionId: string,
    reason?: string,
    immediate?: boolean,
    requestId?: string
  ): Promise<SubscriptionDoc> {
    const sub = await this.getSubscriptionsCol().findOne({ _id: subscriptionId });
    if (!sub) {
      throw new NotFoundError('Subscription not found');
    }

    if (sub.userId !== userId) {
      throw new ForbiddenError('You can only cancel your own subscription');
    }

    if (sub.status === 'cancelled' || sub.status === 'expired') {
      return sub;
    }

    const now = new Date();
    const updateFields: Record<string, unknown> = {
      updatedAt: now,
      cancellationReason: reason?.trim() || 'User requested cancellation',
    };

    if (immediate) {
      updateFields['status'] = 'cancelled';
      updateFields['cancelledAt'] = now;
      updateFields['autoRenew'] = false;
    } else {
      updateFields['cancelAtPeriodEnd'] = true;
      updateFields['autoRenew'] = false;
    }

    await this.getSubscriptionsCol().updateOne(
      { _id: subscriptionId },
      {
        $set: updateFields,
        $inc: { version: 1 },
      }
    );

    const updated = (await this.getSubscriptionsCol().findOne({ _id: subscriptionId }))!;

    await this.auditService.log({
      actorId: userId,
      action: 'user:subscription:cancelled',
      targetType: 'Subscription',
      targetId: subscriptionId,
      reason: updateFields['cancellationReason'] as string,
      metadata: { immediate: !!immediate },
      requestId,
    });

    return updated;
  }

  // ══════════════════════════════════════════════════════════════
  // ── 3. Renewal & Idempotency (AC-E18.3) ──
  // ══════════════════════════════════════════════════════════════

  async renewSubscription(
    subscriptionId: string,
    providerEventId?: string,
    requestId?: string
  ): Promise<{ subscription: SubscriptionDoc; invoice: SubscriptionInvoiceDoc }> {
    const sub = await this.getSubscriptionsCol().findOne({ _id: subscriptionId });
    if (!sub) {
      throw new NotFoundError('Subscription not found');
    }

    const plan = await this.getPlansCol().findOne({ _id: sub.planId });
    if (!plan) {
      throw new NotFoundError('Associated subscription plan not found');
    }

    // Idempotent webhook check: if this provider event already billed, return existing (AC-E18.3)
    if (providerEventId) {
      const existingInvoice = await this.getInvoicesCol().findOne({ providerEventId });
      if (existingInvoice) {
        return { subscription: sub, invoice: existingInvoice };
      }
    }

    const now = new Date();
    const currentEnd = new Date(sub.currentPeriodEnd);
    const newStart = currentEnd > now ? currentEnd : now;
    const newEnd = new Date(newStart.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const invoiceNumber = `INV-${now.getUTCFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const invoiceDoc: SubscriptionInvoiceDoc = {
      _id: `sinv_${randomUUID()}`,
      invoiceNumber,
      subscriptionId,
      userId: sub.userId,
      planId: plan._id,
      amountPiastres: plan.pricePiastres,
      currency: 'EGP',
      status: 'paid',
      billingReason: 'subscription_cycle',
      paymentMethod: plan.pricePiastres > 0 ? 'provider' : 'free_grant',
      providerEventId,
      periodStart: newStart,
      periodEnd: newEnd,
      paidAt: now,
      createdAt: now,
    };

    await this.getInvoicesCol().insertOne(invoiceDoc);

    await this.getSubscriptionsCol().updateOne(
      { _id: subscriptionId },
      {
        $set: {
          status: 'active',
          currentPeriodStart: newStart,
          currentPeriodEnd: newEnd,
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    const updatedSub = (await this.getSubscriptionsCol().findOne({ _id: subscriptionId }))!;

    await this.auditService.log({
      actorId: sub.userId,
      action: 'system:subscription:renewed',
      targetType: 'Subscription',
      targetId: subscriptionId,
      reason: `Renewed subscription ${sub.planCode} until ${newEnd.toISOString()}`,
      metadata: { invoiceNumber, providerEventId },
      requestId,
    });

    return { subscription: updatedSub, invoice: invoiceDoc };
  }

  async handleFailedRenewal(
    subscriptionId: string,
    reason?: string,
    requestId?: string
  ): Promise<SubscriptionDoc> {
    const sub = await this.getSubscriptionsCol().findOne({ _id: subscriptionId });
    if (!sub) {
      throw new NotFoundError('Subscription not found');
    }

    const now = new Date();
    await this.getSubscriptionsCol().updateOne(
      { _id: subscriptionId },
      {
        $set: {
          status: 'past_due',
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    const updated = (await this.getSubscriptionsCol().findOne({ _id: subscriptionId }))!;

    await this.auditService.log({
      actorId: 'system',
      action: 'system:subscription:renewal_failed',
      targetType: 'Subscription',
      targetId: subscriptionId,
      reason: reason || 'Payment provider reported renewal failure',
      requestId,
    });

    return updated;
  }

  // ══════════════════════════════════════════════════════════════
  // ── 4. Entitlements & User Queries ──
  // ══════════════════════════════════════════════════════════════

  async getUserSubscription(
    userId: string,
    roleKey: 'professional' | 'merchant'
  ): Promise<SubscriptionDoc | null> {
    const now = new Date();
    return this.getSubscriptionsCol().findOne({
      userId,
      roleKey,
      status: { $in: ['trial', 'active'] },
      currentPeriodEnd: { $gt: now },
    });
  }

  async getUserEntitlements(
    userId: string,
    roleKey: 'professional' | 'merchant'
  ): Promise<SubscriptionFeatures> {
    const sub = await this.getUserSubscription(userId, roleKey);
    if (!sub) {
      return DEFAULT_FREE_ENTITLEMENTS;
    }
    return {
      ...DEFAULT_FREE_ENTITLEMENTS,
      ...sub.entitlements,
    };
  }

  async listUserInvoices(userId: string): Promise<SubscriptionInvoiceDoc[]> {
    return this.getInvoicesCol().find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  async listAllSubscriptions(filter?: {
    status?: string;
    roleKey?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ subscriptions: SubscriptionDoc[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter?.status) query['status'] = filter.status;
    if (filter?.roleKey) query['roleKey'] = filter.roleKey;

    const limit = Math.min(100, Math.max(1, filter?.limit || 20));
    const skip = Math.max(0, filter?.skip || 0);

    const [subscriptions, total] = await Promise.all([
      this.getSubscriptionsCol().find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      this.getSubscriptionsCol().countDocuments(query),
    ]);

    return { subscriptions, total };
  }
}
