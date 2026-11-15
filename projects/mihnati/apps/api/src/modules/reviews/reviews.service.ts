import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import { ServiceOrderDoc } from '../orders/orders.types.js';
import { MerchantOrderDoc } from '../commerce/commerce.types.js';
import { UserDoc } from '../identity/auth.types.js';
import {
  ReviewDoc,
  ReviewDto,
  ReviewSummaryDto,
  CreateReviewInput,
  ReviewResponseInput,
  ModerateReviewInput,
  ReviewStatus,
} from './reviews.types.js';

export class ReviewsService {
  constructor(private auditService: AuditService) {}

  private getReviewsCollection() {
    return getDb().collection<ReviewDoc>('reviews');
  }

  private getServiceOrdersCollection() {
    return getDb().collection<ServiceOrderDoc>('service_orders');
  }

  private getMerchantOrdersCollection() {
    return getDb().collection<MerchantOrderDoc>('merchant_orders');
  }

  private getUsersCollection() {
    return getDb().collection<UserDoc>('users');
  }

  // ══════════════════════════════════════════════════════════════
  // ── Create Review (ServiceOrder & MerchantOrder) ──
  // ══════════════════════════════════════════════════════════════

  async createServiceOrderReview(
    reviewerId: string,
    serviceOrderId: string,
    input: CreateReviewInput,
    requestId?: string
  ): Promise<ReviewDto> {
    this.validateReviewInput(input);

    const order = await this.getServiceOrdersCollection().findOne({ _id: serviceOrderId });
    if (!order) {
      throw new NotFoundError('Service order not found');
    }

    if (order.customerId !== reviewerId) {
      throw new ForbiddenError('You can only review service orders you participated in as customer');
    }

    if (order.status !== 'completed') {
      throw new ConflictError(
        `Cannot review order with status "${order.status}". Review is only permitted after order completion.`
      );
    }

    const reviewsCol = this.getReviewsCollection();
    const existing = await reviewsCol.findOne({
      subjectType: 'service_order',
      subjectId: serviceOrderId,
      reviewerId,
    });

    if (existing) {
      throw new ConflictError(
        'You have already reviewed this service order',
        'DUPLICATE_REVIEW'
      );
    }

    const reviewer = await this.getUsersCollection().findOne({ _id: reviewerId });
    const reviewerName = reviewer?.name || 'عميل معتمد';

    const now = new Date();
    const reviewDoc: ReviewDoc = {
      _id: randomUUID(),
      subjectType: 'service_order',
      subjectId: serviceOrderId,
      reviewerId,
      reviewerName,
      revieweeId: order.professionalUserId,
      revieweeType: 'professional',
      rating: input.rating,
      comment: input.comment.trim(),
      status: 'visible',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await reviewsCol.insertOne(reviewDoc);
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictError(
          'A review for this order already exists',
          'DUPLICATE_REVIEW'
        );
      }
      throw err;
    }

    // Recalculate target professional profile rating
    await this.updateProfileAggregates(order.professionalUserId, 'professional');

    await this.auditService.log({
      actorId: reviewerId,
      action: 'review:created',
      targetType: 'service_order',
      targetId: serviceOrderId,
      reason: 'Customer submitted review for completed service order',
      metadata: { rating: input.rating, revieweeId: order.professionalUserId },
      requestId,
    });

    return this.toReviewDto(reviewDoc);
  }

  async createMerchantOrderReview(
    reviewerId: string,
    merchantOrderId: string,
    input: CreateReviewInput,
    requestId?: string
  ): Promise<ReviewDto> {
    this.validateReviewInput(input);

    const order = await this.getMerchantOrdersCollection().findOne({ _id: merchantOrderId });
    if (!order) {
      throw new NotFoundError('Merchant order not found');
    }

    if (order.customerId !== reviewerId) {
      throw new ForbiddenError('You can only review merchant orders you placed as customer');
    }

    if (order.status !== 'completed') {
      throw new ConflictError(
        `Cannot review order with status "${order.status}". Review is only permitted after order completion.`
      );
    }

    const reviewsCol = this.getReviewsCollection();
    const existing = await reviewsCol.findOne({
      subjectType: 'merchant_order',
      subjectId: merchantOrderId,
      reviewerId,
    });

    if (existing) {
      throw new ConflictError(
        'You have already reviewed this merchant order',
        'DUPLICATE_REVIEW'
      );
    }

    const reviewer = await this.getUsersCollection().findOne({ _id: reviewerId });
    const reviewerName = reviewer?.name || 'عميل معتمد';

    const now = new Date();
    const reviewDoc: ReviewDoc = {
      _id: randomUUID(),
      subjectType: 'merchant_order',
      subjectId: merchantOrderId,
      reviewerId,
      reviewerName,
      revieweeId: order.merchantUserId,
      revieweeType: 'merchant',
      rating: input.rating,
      comment: input.comment.trim(),
      status: 'visible',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await reviewsCol.insertOne(reviewDoc);
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictError(
          'A review for this order already exists',
          'DUPLICATE_REVIEW'
        );
      }
      throw err;
    }

    // Recalculate merchant profile and store aggregates
    await this.updateProfileAggregates(order.merchantUserId, 'merchant');

    await this.auditService.log({
      actorId: reviewerId,
      action: 'review:created',
      targetType: 'merchant_order',
      targetId: merchantOrderId,
      reason: 'Customer submitted review for completed merchant order',
      metadata: { rating: input.rating, revieweeId: order.merchantUserId, storeId: order.storeId },
      requestId,
    });

    return this.toReviewDto(reviewDoc);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Reviewee Response (Reply Once) ──
  // ══════════════════════════════════════════════════════════════

  async respondToReview(
    revieweeId: string,
    reviewId: string,
    input: ReviewResponseInput,
    requestId?: string
  ): Promise<ReviewDto> {
    if (!input.comment || input.comment.trim().length < 3) {
      throw new ValidationError('Response comment must be at least 3 characters long');
    }

    const reviewsCol = this.getReviewsCollection();
    const review = await reviewsCol.findOne({ _id: reviewId });
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    if (review.revieweeId !== revieweeId) {
      throw new ForbiddenError('You can only respond to reviews addressed to you');
    }

    if (review.response) {
      throw new ConflictError('You have already responded to this review. Edits require approval.');
    }

    const now = new Date();
    await reviewsCol.updateOne(
      { _id: reviewId },
      {
        $set: {
          response: {
            comment: input.comment.trim(),
            respondedAt: now,
          },
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: revieweeId,
      action: 'review:responded',
      targetType: 'review',
      targetId: reviewId,
      reason: 'Reviewee responded to customer review',
      requestId,
    });

    const updated = await reviewsCol.findOne({ _id: reviewId });
    return this.toReviewDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Admin Moderation ──
  // ══════════════════════════════════════════════════════════════

  async moderateReview(
    adminId: string,
    reviewId: string,
    input: ModerateReviewInput,
    requestId?: string
  ): Promise<ReviewDto> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new ValidationError('A detailed reason is required for review moderation');
    }

    const reviewsCol = this.getReviewsCollection();
    const review = await reviewsCol.findOne({ _id: reviewId });
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    let newStatus: ReviewStatus = 'visible';
    if (input.action === 'hide') {
      newStatus = 'hidden_pending_review';
    } else if (input.action === 'remove') {
      newStatus = 'removed';
    } else if (input.action === 'restore') {
      newStatus = 'visible';
    }

    const now = new Date();
    await reviewsCol.updateOne(
      { _id: reviewId },
      {
        $set: {
          status: newStatus,
          moderation: {
            action: input.action,
            reason: input.reason.trim(),
            moderatedBy: adminId,
            moderatedAt: now,
          },
          updatedAt: now,
        },
      }
    );

    // Recalculate target aggregates to ensure hidden/removed reviews are excluded!
    await this.updateProfileAggregates(review.revieweeId, review.revieweeType);

    await this.auditService.log({
      actorId: adminId,
      action: 'review:moderated',
      targetType: 'review',
      targetId: reviewId,
      reason: input.reason.trim(),
      metadata: { action: input.action, newStatus },
      requestId,
    });

    const updated = await reviewsCol.findOne({ _id: reviewId });
    return this.toReviewDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Public Queries & Rating Summaries ──
  // ══════════════════════════════════════════════════════════════

  async listTargetReviews(
    targetId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ reviews: ReviewDto[]; summary: ReviewSummaryDto }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const skip = Math.max(options.offset ?? 0, 0);

    const reviewsCol = this.getReviewsCollection();

    // Query visible reviews only
    const docs = await reviewsCol
      .find({ revieweeId: targetId, status: 'visible' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Compute summary across all visible reviews for this target
    const allVisible = await reviewsCol
      .find({ revieweeId: targetId, status: 'visible' })
      .project<{ rating: number }>({ rating: 1 })
      .toArray();

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of allVisible) {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
        sum += r.rating;
      }
    }

    const totalReviews = allVisible.length;
    const averageRating = totalReviews > 0 ? Math.round((sum / totalReviews) * 10) / 10 : 0;

    return {
      reviews: docs.map((d) => this.toReviewDto(d)),
      summary: {
        averageRating,
        totalReviews,
        distribution,
      },
    };
  }

  async listAdminReviews(
    options: { status?: ReviewStatus; limit?: number; offset?: number } = {}
  ): Promise<ReviewDto[]> {
    const filter: Record<string, unknown> = {};
    if (options.status) {
      filter['status'] = options.status;
    }

    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const skip = Math.max(options.offset ?? 0, 0);

    const docs = await this.getReviewsCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return docs.map((d) => this.toReviewDto(d));
  }

  // ══════════════════════════════════════════════════════════════
  // ── Helpers ──
  // ══════════════════════════════════════════════════════════════

  private validateReviewInput(input: CreateReviewInput): void {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ValidationError('Rating must be an integer between 1 and 5');
    }
    if (!input.comment || input.comment.trim().length < 3) {
      throw new ValidationError('Review comment must be at least 3 characters long');
    }
  }

  private async updateProfileAggregates(
    targetUserId: string,
    targetType: 'professional' | 'merchant'
  ): Promise<void> {
    const db = getDb();
    const reviewsCol = this.getReviewsCollection();

    // Calculate aggregate excluding hidden or removed
    const visibleReviews = await reviewsCol
      .find({ revieweeId: targetUserId, status: 'visible' })
      .project<{ rating: number }>({ rating: 1 })
      .toArray();

    const count = visibleReviews.length;
    const sum = visibleReviews.reduce((acc, curr) => acc + curr.rating, 0);
    const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    if (targetType === 'professional') {
      await db.collection('professional_profiles').updateOne(
        { userId: targetUserId },
        {
          $set: {
            rating: avg,
            reviewCount: count,
            updatedAt: new Date(),
          },
        }
      );
    } else {
      await db.collection('merchant_profiles').updateOne(
        { userId: targetUserId },
        {
          $set: {
            rating: avg,
            reviewCount: count,
            updatedAt: new Date(),
          },
        }
      );
    }
  }

  private toReviewDto(r: ReviewDoc): ReviewDto {
    return {
      id: r._id,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      reviewerId: r.reviewerId,
      reviewerName: r.reviewerName,
      revieweeId: r.revieweeId,
      revieweeType: r.revieweeType,
      rating: r.rating,
      comment: r.comment,
      response: r.response
        ? {
            comment: r.response.comment,
            respondedAt: r.response.respondedAt.toISOString(),
          }
        : undefined,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

