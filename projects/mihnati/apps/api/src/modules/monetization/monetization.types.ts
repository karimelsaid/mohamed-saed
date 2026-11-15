/**
 * Mihnati Platform — E18 Monetization (Commissions & Subscriptions) Types
 */

export type CommissionScope = 'services' | 'commerce';
export type CommissionRuleStatus = 'draft' | 'pending_approval' | 'active' | 'archived';
export type CommissionCollectionStatus = 'pending' | 'waived' | 'collected' | 'disputed';

export interface CommissionRuleDoc {
  _id: string; // crule_<uuid>
  scope: CommissionScope;
  categoryId?: string | null; // If omitted or null, applies platform-wide to the scope
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  rateBps: number; // Basis points: 500 = 5.00%, 1000 = 10.00%
  fixedFeePiastres: number; // In integer piastres (e.g. 0, 500 = 5 EGP)
  minFeePiastres?: number; // Minimum fee floor
  maxFeePiastres?: number; // Maximum fee ceiling
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  version: number;
  status: CommissionRuleStatus;
  proposedBy: string; // Actor ID of the staff member who proposed the rule
  approvedBy?: string; // Actor ID of the staff member who approved (Two-person approval)
  approvedAt?: Date;
  supersededBy?: string; // ruleId of subsequent rule version
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionSnapshotDoc {
  _id: string; // csnap_<uuid>
  orderId: string;
  orderType: 'service_order' | 'merchant_order';
  ruleId: string;
  ruleVersion: number;
  ruleSnapshot: {
    scope: CommissionScope;
    categoryId?: string;
    rateBps: number;
    fixedFeePiastres: number;
    minFeePiastres?: number;
    maxFeePiastres?: number;
  };
  orderAmountPiastres: number;
  rateBps: number;
  fixedFeePiastres: number;
  commissionDiscountBps: number;
  effectiveRateBps: number;
  commissionAmountPiastres: number;
  netAmountPiastres: number;
  currency: 'EGP';
  isCollected: boolean;
  collectionStatus: CommissionCollectionStatus;
  collectedAt?: Date;
  calculatedAt: Date;
  notes?: string;
  version: number;
}

export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'enterprise';
export type SubscriptionBillingInterval = 'monthly' | 'quarterly' | 'annual';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface SubscriptionFeatures {
  maxListings?: number;
  commissionDiscountBps?: number; // e.g. 200 = 2% discount on commission
  priorityPlacement?: boolean;
  verifiedBadge?: boolean;
  analyticsAccess?: boolean;
  customFeatures?: string[];
}

export interface SubscriptionPlanDoc {
  _id: string; // plan_<code or uuid>
  planCode: string; // e.g. 'pro_free', 'pro_starter', 'merchant_basic'
  targetRole: 'professional' | 'merchant';
  tier: SubscriptionTier;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  pricePiastres: number; // 0 for free/trial
  billingInterval: SubscriptionBillingInterval;
  durationDays: number; // e.g. 30, 90, 365
  features: SubscriptionFeatures;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionDoc {
  _id: string; // sub_<uuid>
  userId: string;
  roleKey: 'professional' | 'merchant';
  planId: string;
  planCode: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
  autoRenew: boolean;
  entitlements: SubscriptionFeatures;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export type SubscriptionInvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'void';
export type SubscriptionBillingReason = 'subscription_create' | 'subscription_cycle' | 'subscription_upgrade';
export type SubscriptionPaymentMethod = 'free_grant' | 'provider' | 'manual_admin';

export interface SubscriptionInvoiceDoc {
  _id: string; // sinv_<uuid>
  invoiceNumber: string; // e.g. INV-2026-000001
  subscriptionId: string;
  userId: string;
  planId: string;
  amountPiastres: number;
  currency: 'EGP';
  status: SubscriptionInvoiceStatus;
  billingReason: SubscriptionBillingReason;
  paymentMethod: SubscriptionPaymentMethod;
  providerEventId?: string; // Idempotent webhook/event identifier
  periodStart: Date;
  periodEnd: Date;
  paidAt?: Date;
  createdAt: Date;
}

// ── DTOs ──

export interface ProposeCommissionRuleInput {
  scope: CommissionScope;
  categoryId?: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  rateBps: number;
  fixedFeePiastres: number;
  minFeePiastres?: number;
  maxFeePiastres?: number;
  effectiveFrom?: string; // ISO date string, defaults to now
}

export interface CommissionQuoteParams {
  scope: CommissionScope;
  amountPiastres: number;
  categoryId?: string;
  merchantUserId?: string;
  professionalUserId?: string;
}

export interface CommissionQuoteDto {
  scope: CommissionScope;
  orderAmountPiastres: number;
  ruleId: string;
  ruleVersion: number;
  baseRateBps: number;
  commissionDiscountBps: number;
  effectiveRateBps: number;
  fixedFeePiastres: number;
  commissionAmountPiastres: number;
  netAmountPiastres: number;
  currency: 'EGP';
  calculationDetails: {
    variableFeePiastres: number;
    fixedFeePiastres: number;
    cappedByMin: boolean;
    cappedByMax: boolean;
  };
}

export interface CreateSubscriptionPlanInput {
  planCode: string;
  targetRole: 'professional' | 'merchant';
  tier: SubscriptionTier;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  pricePiastres: number;
  billingInterval: SubscriptionBillingInterval;
  durationDays: number;
  features: SubscriptionFeatures;
}

export interface SubscribeInput {
  planCode: string;
  roleKey: 'professional' | 'merchant';
  providerEventId?: string; // Optional provider reference if coming from webhook
  autoRenew?: boolean;
}

