import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  VerificationCaseDoc,
  VerificationCaseDto,
  VerificationDocument,
  VerificationProfileType,
  PortfolioItemDoc,
  PortfolioItemDto,
  PublicProfessionalProfileDto,
} from './verification.types.js';
import {
  ProfessionalProfileDoc,
  MerchantProfileDoc,
  VerificationStatus,
} from '../roles/role.types.js';

export interface SubmitVerificationInput {
  applicantNotes?: string;
}

export interface ReviewDecisionInput {
  decision: 'verified' | 'rejected' | 'needs_more_info';
  reviewerDecisionNotes: string;
}

export interface CreatePortfolioItemInput {
  title: string;
  description?: string;
  attachments?: Array<{
    fileKey: string;
    fileName: string;
    mimeType: string;
  }>;
}

export class VerificationService {
  constructor(private auditService: AuditService) {}

  private getCasesCollection() {
    return getDb().collection<VerificationCaseDoc>('verification_cases');
  }

  private getPortfolioCollection() {
    return getDb().collection<PortfolioItemDoc>('portfolio_items');
  }

  // ── Applicant Actions ──

  /**
   * Get or create active verification case for user.
   */
  async getOrCreateDraftCase(
    userId: string,
    profileType: VerificationProfileType
  ): Promise<VerificationCaseDoc> {
    const col = this.getCasesCollection();

    // Check if there's already an active (non-rejected) case
    const existing = await col.findOne(
      { userId, profileType },
      { sort: { createdAt: -1 } }
    );

    if (existing && existing.status !== 'rejected') {
      return existing;
    }

    // Verify user actually has the corresponding profile
    const db = getDb();
    if (profileType === 'professional') {
      const pro = await db.collection<ProfessionalProfileDoc>('professional_profiles').findOne({ userId });
      if (!pro) {
        throw new ValidationError('You must activate the Professional role before submitting verification');
      }
    } else if (profileType === 'merchant') {
      const merchant = await db.collection<MerchantProfileDoc>('merchant_profiles').findOne({ userId });
      if (!merchant) {
        throw new ValidationError('You must activate the Merchant role before submitting verification');
      }
    }

    const now = new Date();
    const newCase: VerificationCaseDoc = {
      _id: randomUUID(),
      userId,
      profileType,
      status: 'draft',
      documents: [],
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(newCase);
    return newCase;
  }

  /**
   * Add a document to draft or needs_more_info case.
   */
  async addDocument(
    userId: string,
    caseId: string,
    doc: Omit<VerificationDocument, 'uploadedAt'>
  ): Promise<VerificationCaseDoc> {
    const col = this.getCasesCollection();
    const verificationCase = await col.findOne({ _id: caseId });

    if (!verificationCase) {
      throw new NotFoundError('Verification case not found');
    }
    if (verificationCase.userId !== userId) {
      throw new ForbiddenError('You do not have access to this verification case');
    }
    if (verificationCase.status !== 'draft' && verificationCase.status !== 'needs_more_info') {
      throw new ValidationError(
        `Cannot add documents when case is in status: ${verificationCase.status}`
      );
    }

    const documentEntry: VerificationDocument = {
      ...doc,
      uploadedAt: new Date(),
    };

    await col.updateOne(
      { _id: caseId },
      {
        $push: { documents: documentEntry },
        $set: { updatedAt: new Date() },
      }
    );

    return (await col.findOne({ _id: caseId }))!;
  }

  /**
   * Submit case for admin review.
   */
  async submitForReview(
    userId: string,
    caseId: string,
    input?: SubmitVerificationInput
  ): Promise<VerificationCaseDoc> {
    const col = this.getCasesCollection();
    const verificationCase = await col.findOne({ _id: caseId });

    if (!verificationCase) {
      throw new NotFoundError('Verification case not found');
    }
    if (verificationCase.userId !== userId) {
      throw new ForbiddenError('You do not have access to this verification case');
    }
    if (verificationCase.status !== 'draft' && verificationCase.status !== 'needs_more_info') {
      throw new ConflictError(
        `Cannot submit case in status ${verificationCase.status}. It is already under review or decided.`
      );
    }

    // Validation: Require at least National ID front and back
    const docTypes = new Set(verificationCase.documents.map((d) => d.type));
    if (!docTypes.has('national_id_front') || !docTypes.has('national_id_back')) {
      throw new ValidationError(
        'Both National ID front and back documents are required before submitting verification',
        {
          missingDocuments: [
            ...(!docTypes.has('national_id_front') ? ['national_id_front'] : []),
            ...(!docTypes.has('national_id_back') ? ['national_id_back'] : []),
          ],
        }
      );
    }

    const now = new Date();
    await col.updateOne(
      { _id: caseId },
      {
        $set: {
          status: 'pending_review',
          applicantNotes: input?.applicantNotes ?? verificationCase.applicantNotes,
          updatedAt: now,
        },
      }
    );

    // Update profile status to pending_review
    const db = getDb();
    if (verificationCase.profileType === 'professional') {
      await db.collection<ProfessionalProfileDoc>('professional_profiles').updateOne(
        { userId },
        { $set: { verificationStatus: 'pending_review', updatedAt: now } }
      );
    } else {
      await db.collection<MerchantProfileDoc>('merchant_profiles').updateOne(
        { userId },
        { $set: { verificationStatus: 'pending_review', updatedAt: now } }
      );
    }

    return (await col.findOne({ _id: caseId }))!;
  }

  /**
   * Get verification case details for the applicant.
   */
  async getMyCase(userId: string, profileType: VerificationProfileType): Promise<VerificationCaseDto | null> {
    const col = this.getCasesCollection();
    const c = await col.findOne({ userId, profileType }, { sort: { createdAt: -1 } });
    if (!c) return null;
    return this.toDto(c);
  }

  // ── Admin / Reviewer Actions (Requires admin:verification:review) ──

  /**
   * List verification cases for review queue.
   */
  async listCases(params?: {
    status?: VerificationStatus;
    profileType?: VerificationProfileType;
  }): Promise<VerificationCaseDoc[]> {
    const col = this.getCasesCollection();
    const filter: Record<string, unknown> = {};
    if (params?.status) filter['status'] = params.status;
    if (params?.profileType) filter['profileType'] = params.profileType;

    return col.find(filter).sort({ createdAt: -1 }).toArray();
  }

  /**
   * Get case details for review. Logs sensitive read audit.
   */
  async getCaseForReview(
    caseId: string,
    reviewerId: string,
    requestId?: string
  ): Promise<VerificationCaseDoc> {
    const col = this.getCasesCollection();
    const c = await col.findOne({ _id: caseId });
    if (!c) {
      throw new NotFoundError('Verification case not found');
    }

    // Sensitive read audit
    await this.auditService.log({
      actorId: reviewerId,
      action: 'verification:read',
      targetType: 'verification_case',
      targetId: caseId,
      sensitivePurpose: 'Verification case document review and decision',
      requestId,
    });

    return c;
  }

  /**
   * Reviewer submits decision (verified, rejected, needs_more_info).
   */
  async decideCase(
    caseId: string,
    reviewerId: string,
    input: ReviewDecisionInput,
    requestId?: string
  ): Promise<VerificationCaseDoc> {
    const col = this.getCasesCollection();
    const c = await col.findOne({ _id: caseId });
    if (!c) {
      throw new NotFoundError('Verification case not found');
    }

    if (c.userId === reviewerId) {
      throw new ForbiddenError('Separation of duties: Reviewer cannot decide their own verification case');
    }

    if (c.status !== 'pending_review') {
      throw new ConflictError(
        `Case must be in pending_review status to record a decision. Current status: ${c.status}`
      );
    }

    const now = new Date();
    await col.updateOne(
      { _id: caseId },
      {
        $set: {
          status: input.decision,
          reviewerDecisionNotes: input.reviewerDecisionNotes,
          decidedAt: now,
          decidedBy: reviewerId,
          updatedAt: now,
        },
      }
    );

    // Update the profile's verificationStatus
    const db = getDb();
    if (c.profileType === 'professional') {
      await db.collection<ProfessionalProfileDoc>('professional_profiles').updateOne(
        { userId: c.userId },
        { $set: { verificationStatus: input.decision, updatedAt: now } }
      );
    } else {
      await db.collection<MerchantProfileDoc>('merchant_profiles').updateOne(
        { userId: c.userId },
        { $set: { verificationStatus: input.decision, updatedAt: now } }
      );
    }

    // Immutable audit log
    await this.auditService.log({
      actorId: reviewerId,
      action: `verification:decide:${input.decision}`,
      targetType: 'verification_case',
      targetId: caseId,
      reason: input.reviewerDecisionNotes,
      metadata: {
        userId: c.userId,
        profileType: c.profileType,
        decision: input.decision,
      },
      requestId,
    });

    return (await col.findOne({ _id: caseId }))!;
  }

  // ── Portfolio & Public Profile ──

  async addPortfolioItem(userId: string, input: CreatePortfolioItemInput): Promise<PortfolioItemDto> {
    const db = getDb();
    const pro = await db.collection<ProfessionalProfileDoc>('professional_profiles').findOne({ userId });
    if (!pro) {
      throw new NotFoundError('Professional profile not found. Please activate professional role first.');
    }

    const count = await this.getPortfolioCollection().countDocuments({
      professionalProfileId: pro._id,
    });

    const now = new Date();
    const doc: PortfolioItemDoc = {
      _id: randomUUID(),
      professionalProfileId: pro._id,
      userId,
      title: input.title.trim(),
      description: input.description?.trim(),
      attachments: input.attachments ?? [],
      sortOrder: count + 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.getPortfolioCollection().insertOne(doc);
    return this.toPortfolioDto(doc);
  }

  async listPortfolioItems(userId: string): Promise<PortfolioItemDto[]> {
    const db = getDb();
    const pro = await db.collection<ProfessionalProfileDoc>('professional_profiles').findOne({ userId });
    if (!pro) return [];

    const items = await this.getPortfolioCollection()
      .find({ professionalProfileId: pro._id })
      .sort({ sortOrder: 1, createdAt: -1 })
      .toArray();

    return items.map((i) => this.toPortfolioDto(i));
  }

  async deletePortfolioItem(userId: string, itemId: string): Promise<void> {
    const item = await this.getPortfolioCollection().findOne({ _id: itemId });
    if (!item) {
      throw new NotFoundError('Portfolio item not found');
    }
    if (item.userId !== userId) {
      throw new ForbiddenError('You do not own this portfolio item');
    }
    await this.getPortfolioCollection().deleteOne({ _id: itemId });
  }

  /**
   * Public professional profile view by slug (AC-E05.1).
   * Strict allowlist projection: hides phone, exact address, national ID, and documents.
   */
  async getPublicProfileBySlug(slug: string): Promise<PublicProfessionalProfileDto> {
    const db = getDb();
    const pro = await db.collection<ProfessionalProfileDoc>('professional_profiles').findOne({ slug });
    if (!pro) {
      throw new NotFoundError('Professional not found');
    }

    const portfolio = await this.getPortfolioCollection()
      .find({ professionalProfileId: pro._id })
      .sort({ sortOrder: 1 })
      .toArray();

    return {
      slug: pro.slug,
      title: pro.title,
      bio: pro.bio,
      specialties: pro.specialties,
      publicApproxLocation: pro.publicApproxLocation,
      verificationStatus: pro.verificationStatus,
      portfolio: portfolio.map((p) => this.toPortfolioDto(p)),
    };
  }

  // ── Eligibility Enforcement Guard (AC-E05.3) ──

  /**
   * Asserts that user is an active, verified professional.
   * Throws ForbiddenError if not verified.
   */
  async assertVerifiedProfessional(userId: string): Promise<ProfessionalProfileDoc> {
    const db = getDb();
    const pro = await db.collection<ProfessionalProfileDoc>('professional_profiles').findOne({ userId });
    if (!pro) {
      throw new ForbiddenError('Professional profile required');
    }
    if (pro.verificationStatus !== 'verified') {
      throw new ForbiddenError(
        `Action blocked: Verification required. Current verification status is "${pro.verificationStatus}".`
      );
    }
    return pro;
  }

  /**
   * Asserts that user is an active, verified merchant.
   * Throws ForbiddenError if not verified.
   */
  async assertVerifiedMerchant(userId: string): Promise<MerchantProfileDoc> {
    const db = getDb();
    const merchant = await db.collection<MerchantProfileDoc>('merchant_profiles').findOne({ userId });
    if (!merchant) {
      throw new ForbiddenError('Merchant profile required');
    }
    if (merchant.verificationStatus !== 'verified') {
      throw new ForbiddenError(
        `Action blocked: Verification required. Current verification status is "${merchant.verificationStatus}".`
      );
    }
    return merchant;
  }

  // ── Private DTO helpers ──

  private toDto(c: VerificationCaseDoc): VerificationCaseDto {
    return {
      id: c._id,
      userId: c.userId,
      profileType: c.profileType,
      status: c.status,
      documents: c.documents.map((d) => ({
        type: d.type,
        fileName: d.fileName,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
      applicantNotes: c.applicantNotes,
      reviewerDecisionNotes: c.reviewerDecisionNotes,
      decidedAt: c.decidedAt?.toISOString(),
      createdAt: c.createdAt.toISOString(),
    };
  }

  private toPortfolioDto(i: PortfolioItemDoc): PortfolioItemDto {
    return {
      id: i._id,
      title: i.title,
      description: i.description,
      attachments: i.attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
      })),
      sortOrder: i.sortOrder,
      createdAt: i.createdAt.toISOString(),
    };
  }
}
