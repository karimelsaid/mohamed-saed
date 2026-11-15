export type CodReportStatus = 'collected' | 'not_collected';

export type CodPaymentStatus =
  | 'pending'
  | 'expected'
  | 'merchant_reported_collected'
  | 'merchant_reported_not_collected'
  | 'discrepancy_reported'
  | 'under_review'
  | 'closed';

export interface CodReportDoc {
  _id: string;
  orderId: string;
  orderNumber: string;
  merchantUserId: string;
  storeId: string;
  status: CodReportStatus;
  amountCollectedPiastres: number;
  expectedPiastres: number;
  reason?: string;
  proofRefs?: string[];
  notes?: string;
  isAssertion: true;
  createdAt: Date;
}

export interface CodReportDto {
  id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  status: CodReportStatus;
  amountCollectedPiastres: number;
  expectedPiastres: number;
  reason?: string;
  proofRefs?: string[];
  notes?: string;
  isAssertion: true;
  disclaimer: string;
  createdAt: string;
}

export type CodDisputeStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

export type CodDisputeOutcome =
  | 'upheld_merchant'
  | 'upheld_customer'
  | 'partial_adjustment'
  | 'no_collection_due';

export interface CodDisputeDoc {
  _id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  merchantUserId: string;
  storeId: string;
  disputeReason: string;
  customerClaimedAmountPiastres?: number;
  evidenceMediaRefs?: string[];
  status: CodDisputeStatus;
  assignedStaffId?: string;
  resolutionNotes?: string;
  resolutionOutcome?: CodDisputeOutcome;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CodDisputeDto {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  disputeReason: string;
  customerClaimedAmountPiastres?: number;
  evidenceMediaRefs?: string[];
  status: CodDisputeStatus;
  assignedStaffId?: string;
  resolutionNotes?: string;
  resolutionOutcome?: CodDisputeOutcome;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCodReportInput {
  status: CodReportStatus;
  amountCollectedPiastres?: number;
  reason?: string;
  proofRefs?: string[];
  notes?: string;
}

export interface CreateCodDisputeInput {
  disputeReason: string;
  customerClaimedAmountPiastres?: number;
  evidenceMediaRefs?: string[];
}

export interface ResolveCodDisputeInput {
  resolutionOutcome: CodDisputeOutcome;
  resolutionNotes: string;
}

