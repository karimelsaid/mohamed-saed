/**
 * Mihnati Platform — E16 Complaints, Disputes & Returns Types
 * Aligned with docs/IMPLEMENTATION-BACKLOG.md (E16) & docs/STATE-MACHINES.md (Sections 11 & 12).
 */

// ══════════════════════════════════════════════════════════════
// ── Support Tickets & Messages ──
// ══════════════════════════════════════════════════════════════

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SupportTicketCategory =
  | 'account'
  | 'order'
  | 'service'
  | 'payment_cod'
  | 'technical'
  | 'safety'
  | 'other';

export interface SupportTicketDoc {
  _id: string;
  ticketNumber: string;
  userId: string;
  userRole: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedStaffId?: string;
  relatedOrderId?: string;
  relatedOrderType?: 'service' | 'merchant';
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface SupportTicketDto {
  id: string;
  ticketNumber: string;
  userId: string;
  userRole: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedStaffId?: string;
  relatedOrderId?: string;
  relatedOrderType?: 'service' | 'merchant';
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface SupportMessageDoc {
  _id: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'staff';
  message: string;
  attachments?: string[];
  createdAt: Date;
}

export interface SupportMessageDto {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'staff';
  message: string;
  attachments?: string[];
  createdAt: string;
}

export interface CreateSupportTicketInput {
  subject: string;
  category: SupportTicketCategory;
  priority?: SupportTicketPriority;
  message: string;
  relatedOrderId?: string;
  relatedOrderType?: 'service' | 'merchant';
  attachments?: string[];
}

export interface CreateSupportMessageInput {
  message: string;
  attachments?: string[];
}

// ══════════════════════════════════════════════════════════════
// ── Reports (Content, Users, Reviews, Orders) ──
// ══════════════════════════════════════════════════════════════

export type ReportTargetType =
  | 'user'
  | 'store'
  | 'service'
  | 'product'
  | 'review'
  | 'order';

export type ReportStatus =
  | 'pending'
  | 'under_review'
  | 'actioned'
  | 'dismissed';

export interface ReportDoc {
  _id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  evidenceUrls?: string[];
  status: ReportStatus;
  assignedStaffId?: string;
  resolutionReason?: string;
  actionTaken?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportDto {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  evidenceUrls?: string[];
  status: ReportStatus;
  assignedStaffId?: string;
  resolutionReason?: string;
  actionTaken?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  evidenceUrls?: string[];
}

export interface ResolveReportInput {
  status: 'actioned' | 'dismissed';
  resolutionReason: string;
  actionTaken?: string;
}

// ══════════════════════════════════════════════════════════════
// ── Formal Order Disputes ──
// ══════════════════════════════════════════════════════════════

export type DisputeStatus =
  | 'open'
  | 'awaiting_evidence'
  | 'under_review'
  | 'decision_issued'
  | 'appeal_requested'
  | 'resolved'
  | 'dismissed';

export type DisputeSubjectType = 'service_order' | 'merchant_order';

export type DisputeOutcome =
  | 'resume_service'
  | 'complete_service'
  | 'cancel_service'
  | 'complete_delivery'
  | 'cancel_order'
  | 'approve_return'
  | 'reject_return'
  | 'no_change';

export interface DisputeEvidence {
  id: string;
  submittedBy: string;
  role: 'initiator' | 'respondent' | 'reviewer';
  description: string;
  attachmentUrls?: string[];
  submittedAt: Date;
}

export interface DisputeDecision {
  issuedBy: string;
  outcome: DisputeOutcome;
  reason: string;
  issuedAt: Date;
}

export interface DisputeAppeal {
  requestedBy: string;
  reason: string;
  evidenceUrls?: string[];
  requestedAt: Date;
  secondReviewerId?: string;
  secondReviewDecision?: DisputeDecision;
}

export interface DisputeDoc {
  _id: string;
  disputeNumber: string;
  subjectType: DisputeSubjectType;
  subjectId: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  status: DisputeStatus;
  evidenceDeadline?: Date;
  evidenceRequestDescription?: string;
  evidenceList: DisputeEvidence[];
  assignedReviewerId?: string;
  initialDecision?: DisputeDecision;
  appeal?: DisputeAppeal;
  finalOutcome?: DisputeOutcome;
  finalReason?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeDto {
  id: string;
  disputeNumber: string;
  subjectType: DisputeSubjectType;
  subjectId: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  status: DisputeStatus;
  evidenceDeadline?: string;
  evidenceRequestDescription?: string;
  evidenceList: Array<{
    id: string;
    submittedBy: string;
    role: string;
    description: string;
    attachmentUrls?: string[];
    submittedAt: string;
  }>;
  assignedReviewerId?: string;
  initialDecision?: {
    issuedBy: string;
    outcome: DisputeOutcome;
    reason: string;
    issuedAt: string;
  };
  appeal?: {
    requestedBy: string;
    reason: string;
    evidenceUrls?: string[];
    requestedAt: string;
    secondReviewerId?: string;
    secondReviewDecision?: {
      issuedBy: string;
      outcome: DisputeOutcome;
      reason: string;
      issuedAt: string;
    };
  };
  finalOutcome?: DisputeOutcome;
  finalReason?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDisputeInput {
  subjectType: DisputeSubjectType;
  subjectId: string;
  reason: string;
  initialEvidenceDescription?: string;
  initialAttachmentUrls?: string[];
}

export interface SubmitEvidenceInput {
  description: string;
  attachmentUrls?: string[];
}

export interface RequestEvidenceInput {
  description: string;
  deadlineDays?: number;
}

export interface IssueDecisionInput {
  outcome: DisputeOutcome;
  reason: string;
}

export interface AppealDisputeInput {
  reason: string;
  evidenceUrls?: string[];
}

export interface AppealDecisionInput {
  outcome: DisputeOutcome;
  reason: string;
}

// ══════════════════════════════════════════════════════════════
// ── Return Requests ──
// ══════════════════════════════════════════════════════════════

export type ReturnRequestStatus =
  | 'requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'awaiting_return'
  | 'in_transit'
  | 'received'
  | 'inspecting'
  | 'accepted'
  | 'resolved';

export type ReturnResolution = 'refund_due' | 'exchange' | 'no_change';

export interface ReturnItem {
  productId: string;
  variantId?: string;
  quantity: number;
  reason: string;
  condition?: string;
  evidenceUrls?: string[];
}

export interface ReturnRequestDoc {
  _id: string;
  returnNumber: string;
  orderId: string; // MerchantOrder ID
  storeId: string;
  customerId: string;
  merchantId: string;
  status: ReturnRequestStatus;
  items: ReturnItem[];
  rejectionReason?: string;
  merchantInspection?: {
    inspectedBy: string;
    conditionNotes: string;
    result: 'accepted' | 'rejected';
    inspectedAt: Date;
    evidenceUrls?: string[];
  };
  resolution?: ReturnResolution;
  resolutionNotes?: string;
  codRefundReport?: {
    reportedBy: string;
    amountPiastres: number;
    method: string;
    isAssertion: true;
    disclaimer: string;
    reportedAt: Date;
  };
  disputeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnRequestDto {
  id: string;
  returnNumber: string;
  orderId: string;
  storeId: string;
  customerId: string;
  merchantId: string;
  status: ReturnRequestStatus;
  items: ReturnItem[];
  rejectionReason?: string;
  merchantInspection?: {
    inspectedBy: string;
    conditionNotes: string;
    result: 'accepted' | 'rejected';
    inspectedAt: string;
    evidenceUrls?: string[];
  };
  resolution?: ReturnResolution;
  resolutionNotes?: string;
  codRefundReport?: {
    reportedBy: string;
    amountPiastres: number;
    method: string;
    isAssertion: true;
    disclaimer: string;
    reportedAt: string;
  };
  disputeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnRequestInput {
  orderId: string;
  items: ReturnItem[];
}

export interface ReviewReturnInput {
  approved: boolean;
  reason?: string;
}

export interface InspectReturnInput {
  conditionNotes: string;
  result: 'accepted' | 'rejected';
  evidenceUrls?: string[];
}

export interface ResolveReturnInput {
  resolution: ReturnResolution;
  resolutionNotes?: string;
  codRefundAmountPiastres?: number;
  codRefundMethod?: string;
}

