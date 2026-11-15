export type ReviewSubjectType = 'service_order' | 'merchant_order';

export type ReviewStatus = 'visible' | 'hidden_pending_review' | 'removed';

export interface ReviewResponse {
  comment: string;
  respondedAt: Date;
}

export interface ReviewModeration {
  action: 'hide' | 'restore' | 'remove';
  reason: string;
  moderatedBy: string;
  moderatedAt: Date;
}

export interface ReviewDoc {
  _id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  reviewerId: string;
  reviewerName: string;
  revieweeId: string;
  revieweeType: 'professional' | 'merchant';
  rating: number; // 1 to 5 integer
  comment: string;
  response?: ReviewResponse;
  status: ReviewStatus;
  moderation?: ReviewModeration;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewDto {
  id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  reviewerId: string;
  reviewerName: string;
  revieweeId: string;
  revieweeType: 'professional' | 'merchant';
  rating: number;
  comment: string;
  response?: {
    comment: string;
    respondedAt: string;
  };
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSummaryDto {
  averageRating: number;
  totalReviews: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface CreateReviewInput {
  rating: number;
  comment: string;
}

export interface ReviewResponseInput {
  comment: string;
}

export interface ModerateReviewInput {
  action: 'hide' | 'restore' | 'remove';
  reason: string;
}

