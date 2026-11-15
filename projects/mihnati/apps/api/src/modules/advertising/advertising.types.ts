/**
 * Mihnati Platform — E19 Advertising & Promotion Types
 */

export type AdCampaignType = 'promoted_service' | 'promoted_store' | 'promoted_product';
export type AdCampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected';
export type AdBillingMethod = 'prepaid_budget' | 'subscription_benefit' | 'free_credit';
export type AdDeliveryEventType = 'impression' | 'click';

export interface AdTargetingCriteria {
  governorateIds?: string[];
  localityIds?: string[];
  categoryIds?: string[];
  // AC-E19.3: Privacy invariant: Sensitive personal categories (religion, health, biometric, personal attributes) are prohibited!
}

export interface AdCampaignDoc {
  _id: string; // camp_<uuid>
  advertiserUserId: string;
  advertiserRole: 'professional' | 'merchant';
  campaignType: AdCampaignType;
  targetId: string; // ID of the promoted service, store, or product
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  budgetPiastres: number; // Total budget cap (e.g. 50000 = 500 EGP)
  spentPiastres: number; // Accumulated spend
  costPerImpressionPiastres: number; // e.g. 20 = 0.20 EGP
  costPerClickPiastres: number; // e.g. 150 = 1.50 EGP
  dailyBudgetCapPiastres?: number;
  targeting: AdTargetingCriteria;
  startDate: Date;
  endDate: Date;
  status: AdCampaignStatus;
  rejectionReason?: string;
  moderatedBy?: string;
  moderatedAt?: Date;
  metrics: {
    impressionsCount: number;
    clicksCount: number;
  };
  billingMethod: AdBillingMethod;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface AdDeliveryEventDoc {
  _id: string; // adev_<uuid>
  campaignId: string;
  eventType: AdDeliveryEventType;
  placementContext: 'search_services' | 'search_products' | 'home_feed';
  costPiastres: number;
  idempotencyKey?: string; // AC-E19.2: Deduplication prevents double-counting/charging
  pseudonymizedViewerId?: string; // Privacy-safe pseudonymous hash
  recordedAt: Date;
}

export interface SponsoredItemDto {
  campaignId: string;
  targetType: AdCampaignType;
  targetId: string;
  item: Record<string, unknown>; // Underlying entity details (service/store/product)
  isSponsored: true; // AC-E19.1: Visible contractual labeling
  sponsorLabelAr: 'إعلان ممول';
  sponsorLabelEn: 'Sponsored';
}

// ── DTOs ──

export interface CreateCampaignInput {
  campaignType: AdCampaignType;
  targetId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  budgetPiastres: number;
  costPerImpressionPiastres?: number;
  costPerClickPiastres?: number;
  dailyBudgetCapPiastres?: number;
  targeting?: AdTargetingCriteria & Record<string, unknown>;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  billingMethod?: AdBillingMethod;
}

export interface ModerateCampaignInput {
  action: 'approve' | 'reject';
  reason?: string;
}

export interface RecordDeliveryEventInput {
  campaignId: string;
  eventType: AdDeliveryEventType;
  placementContext: 'search_services' | 'search_products' | 'home_feed';
  idempotencyKey?: string;
  viewerId?: string;
}

export interface CampaignMetricsDto {
  campaignId: string;
  status: AdCampaignStatus;
  budgetPiastres: number;
  spentPiastres: number;
  remainingBudgetPiastres: number;
  impressionsCount: number;
  clicksCount: number;
  clickThroughRatePercent: number;
  isBudgetExhausted: boolean;
  isActive: boolean;
}

