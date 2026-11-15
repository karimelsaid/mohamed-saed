import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import { VerificationService } from '../verification/verification.service.js';
import {
  ServiceDoc,
  ServiceDto,
  PublicServiceDto,
  PriceType,
  ServiceMedia,
} from './services.types.js';
import { ProfessionalProfileDoc } from '../roles/role.types.js';
import { CategoryDoc, SpecialtyDoc } from '../taxonomy/taxonomy.types.js';
import { GovernorateDoc, LocalityDoc } from '../geography/geography.types.js';

export interface CreateServiceInput {
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  priceType: PriceType;
  pricePiastres: number;
  governorateId: string;
  localityId?: string;
  media?: ServiceMedia[];
}

export interface UpdateServiceInput {
  categoryId?: string;
  specialtyId?: string;
  title?: string;
  description?: string;
  priceType?: PriceType;
  pricePiastres?: number;
  governorateId?: string;
  localityId?: string;
  media?: ServiceMedia[];
}

export interface SearchServicesFilter {
  categoryId?: string;
  specialtyId?: string;
  governorateId?: string;
  localityId?: string;
  priceType?: PriceType;
  minPricePiastres?: number;
  maxPricePiastres?: number;
  query?: string;
  limit?: number;
  skip?: number;
}

export class ServicesService {
  constructor(
    private auditService: AuditService,
    private verificationService: VerificationService
  ) {}

  private getCollection() {
    return getDb().collection<ServiceDoc>('services');
  }

  // ── Professional Service Authoring ──

  async createDraft(userId: string, input: CreateServiceInput): Promise<ServiceDto> {
    const db = getDb();
    const pro = await db.collection<ProfessionalProfileDoc>('professional_profiles').findOne({ userId });
    if (!pro) {
      throw new ForbiddenError('Professional profile required to create services');
    }

    // Validate category
    const category = await db.collection<CategoryDoc>('categories').findOne({
      _id: input.categoryId,
      type: 'service',
      status: 'active',
    });
    if (!category) {
      throw new ValidationError('Invalid or inactive service category');
    }

    // Validate specialty if provided
    if (input.specialtyId) {
      const spec = await db.collection<SpecialtyDoc>('specialties').findOne({
        _id: input.specialtyId,
        categoryId: input.categoryId,
        status: 'active',
      });
      if (!spec) {
        throw new ValidationError('Specialty does not belong to the selected category or is inactive');
      }
    }

    // Validate governorate
    const gov = await db.collection<GovernorateDoc>('governorates').findOne({ _id: input.governorateId });
    if (!gov) {
      throw new ValidationError('Invalid governorate ID');
    }

    // Validate price
    if (!Number.isInteger(input.pricePiastres) || input.pricePiastres < 0) {
      throw new ValidationError('Price must be a non-negative integer in piastres');
    }

    const now = new Date();
    const doc: ServiceDoc = {
      _id: randomUUID(),
      professionalProfileId: pro._id,
      userId,
      categoryId: input.categoryId,
      specialtyId: input.specialtyId,
      title: input.title.trim(),
      description: input.description.trim(),
      priceType: input.priceType,
      pricePiastres: input.pricePiastres,
      governorateId: input.governorateId,
      localityId: input.localityId,
      media: input.media ?? [],
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.getCollection().insertOne(doc);
    return this.toDto(doc);
  }

  async updateDraft(
    userId: string,
    serviceId: string,
    input: UpdateServiceInput
  ): Promise<ServiceDto> {
    const col = this.getCollection();
    const service = await col.findOne({ _id: serviceId });

    if (!service) throw new NotFoundError('Service not found');
    if (service.userId !== userId) throw new ForbiddenError('You do not own this service');
    if (service.status !== 'draft' && service.status !== 'rejected') {
      throw new ConflictError(`Cannot edit service in status: ${service.status}. It must be in draft.`);
    }

    const updates: Partial<ServiceDoc> = {
      updatedAt: new Date(),
      version: service.version + 1,
    };

    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.description !== undefined) updates.description = input.description.trim();
    if (input.priceType !== undefined) updates.priceType = input.priceType;
    if (input.pricePiastres !== undefined) {
      if (!Number.isInteger(input.pricePiastres) || input.pricePiastres < 0) {
        throw new ValidationError('Price must be a non-negative integer in piastres');
      }
      updates.pricePiastres = input.pricePiastres;
    }
    if (input.media !== undefined) updates.media = input.media;
    if (input.governorateId !== undefined) updates.governorateId = input.governorateId;
    if (input.localityId !== undefined) updates.localityId = input.localityId;

    await col.updateOne({ _id: serviceId }, { $set: updates });
    const updated = await col.findOne({ _id: serviceId });
    return this.toDto(updated!);
  }

  /**
   * Submit service for admin moderation.
   * Enforces verified professional eligibility (AC-E06.2 / AC-E05.3).
   */
  async submitForReview(userId: string, serviceId: string): Promise<ServiceDto> {
    // 1. Enforce verified professional eligibility
    await this.verificationService.assertVerifiedProfessional(userId);

    const col = this.getCollection();
    const service = await col.findOne({ _id: serviceId });

    if (!service) throw new NotFoundError('Service not found');
    if (service.userId !== userId) throw new ForbiddenError('You do not own this service');
    if (service.status !== 'draft' && service.status !== 'rejected') {
      throw new ConflictError(`Cannot submit service in status: ${service.status}`);
    }

    const now = new Date();
    await col.updateOne(
      { _id: serviceId },
      {
        $set: {
          status: 'pending_review',
          rejectionReason: undefined,
          updatedAt: now,
          version: service.version + 1,
        },
      }
    );

    const updated = await col.findOne({ _id: serviceId });
    return this.toDto(updated!);
  }

  async pauseService(userId: string, serviceId: string): Promise<ServiceDto> {
    const col = this.getCollection();
    const service = await col.findOne({ _id: serviceId });

    if (!service) throw new NotFoundError('Service not found');
    if (service.userId !== userId) throw new ForbiddenError('You do not own this service');
    if (service.status !== 'published') {
      throw new ConflictError('Only published services can be paused');
    }

    await col.updateOne(
      { _id: serviceId },
      { $set: { status: 'paused', updatedAt: new Date() } }
    );
    const updated = await col.findOne({ _id: serviceId });
    return this.toDto(updated!);
  }

  async resumeService(userId: string, serviceId: string): Promise<ServiceDto> {
    const col = this.getCollection();
    const service = await col.findOne({ _id: serviceId });

    if (!service) throw new NotFoundError('Service not found');
    if (service.userId !== userId) throw new ForbiddenError('You do not own this service');
    if (service.status !== 'paused') {
      throw new ConflictError('Only paused services can be resumed');
    }

    await col.updateOne(
      { _id: serviceId },
      { $set: { status: 'published', updatedAt: new Date() } }
    );
    const updated = await col.findOne({ _id: serviceId });
    return this.toDto(updated!);
  }

  async archiveService(userId: string, serviceId: string): Promise<ServiceDto> {
    const col = this.getCollection();
    const service = await col.findOne({ _id: serviceId });

    if (!service) throw new NotFoundError('Service not found');
    if (service.userId !== userId) throw new ForbiddenError('You do not own this service');

    await col.updateOne(
      { _id: serviceId },
      { $set: { status: 'archived', updatedAt: new Date() } }
    );
    const updated = await col.findOne({ _id: serviceId });
    return this.toDto(updated!);
  }

  async listMyServices(userId: string): Promise<ServiceDto[]> {
    const services = await this.getCollection()
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return services.map((s) => this.toDto(s));
  }

  // ── Admin Moderation ──

  async listPendingServices(): Promise<ServiceDoc[]> {
    return this.getCollection()
      .find({ status: 'pending_review' })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async moderateService(
    serviceId: string,
    moderatorId: string,
    decision: 'published' | 'rejected',
    notes?: string,
    requestId?: string
  ): Promise<ServiceDto> {
    const col = this.getCollection();
    const service = await col.findOne({ _id: serviceId });

    if (!service) throw new NotFoundError('Service not found');
    if (service.status !== 'pending_review') {
      throw new ConflictError(`Service is not in pending_review. Current status: ${service.status}`);
    }

    const now = new Date();
    const updates: Partial<ServiceDoc> = {
      status: decision,
      moderatorNotes: notes,
      updatedAt: now,
      version: service.version + 1,
    };

    if (decision === 'published') {
      updates.publishedAt = now;
      updates.rejectionReason = undefined;
    } else {
      updates.rejectionReason = notes;
    }

    await col.updateOne({ _id: serviceId }, { $set: updates });

    // Immutable audit log
    await this.auditService.log({
      actorId: moderatorId,
      action: `service:moderate:${decision}`,
      targetType: 'service',
      targetId: serviceId,
      reason: notes,
      metadata: {
        serviceTitle: service.title,
        decision,
      },
      requestId,
    });

    const updated = await col.findOne({ _id: serviceId });
    return this.toDto(updated!);
  }

  // ── Public Search & Discovery (AC-E06.2) ──

  async searchServices(filter: SearchServicesFilter): Promise<{ items: PublicServiceDto[]; total: number }> {
    const db = getDb();
    const query: Record<string, unknown> = {
      status: 'published',
    };

    if (filter.categoryId) query['categoryId'] = filter.categoryId;
    if (filter.specialtyId) query['specialtyId'] = filter.specialtyId;
    if (filter.governorateId) query['governorateId'] = filter.governorateId;
    if (filter.localityId) query['localityId'] = filter.localityId;
    if (filter.priceType) query['priceType'] = filter.priceType;

    if (filter.minPricePiastres !== undefined || filter.maxPricePiastres !== undefined) {
      query['pricePiastres'] = {};
      if (filter.minPricePiastres !== undefined) {
        (query['pricePiastres'] as any).$gte = filter.minPricePiastres;
      }
      if (filter.maxPricePiastres !== undefined) {
        (query['pricePiastres'] as any).$lte = filter.maxPricePiastres;
      }
    }

    if (filter.query) {
      query['$text'] = { $search: filter.query };
    }

    const limit = Math.min(filter.limit ?? 20, 50);
    const skip = filter.skip ?? 0;

    const total = await this.getCollection().countDocuments(query);
    const docs = await this.getCollection()
      .find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Fetch governorates, localities, and pro profiles for projection
    const proIds = [...new Set(docs.map((d) => d.professionalProfileId))];
    const govIds = [...new Set(docs.map((d) => d.governorateId))];
    const locIds = [...new Set(docs.map((d) => d.localityId).filter(Boolean))] as string[];

    const [pros, govs, locs] = await Promise.all([
      db.collection<ProfessionalProfileDoc>('professional_profiles').find({ _id: { $in: proIds } }).toArray(),
      db.collection<GovernorateDoc>('governorates').find({ _id: { $in: govIds } }).toArray(),
      db.collection<LocalityDoc>('localities').find({ _id: { $in: locIds } }).toArray(),
    ]);

    const proMap = new Map(pros.map((p) => [p._id, p]));
    const govMap = new Map(govs.map((g) => [g._id, g]));
    const locMap = new Map(locs.map((l) => [l._id, l]));

    const items: PublicServiceDto[] = docs.map((d) => {
      const pro = proMap.get(d.professionalProfileId);
      const gov = govMap.get(d.governorateId);
      const loc = d.localityId ? locMap.get(d.localityId) : undefined;

      return {
        id: d._id,
        title: d.title,
        description: d.description,
        priceType: d.priceType,
        pricePiastres: d.pricePiastres,
        categoryId: d.categoryId,
        specialtyId: d.specialtyId,
        media: d.media.map((m) => ({ fileName: m.fileName, mimeType: m.mimeType })),
        approximateLocation: {
          governorate: gov?.nameAr || 'مصر',
          locality: loc?.nameAr,
        },
        professional: {
          slug: pro?.slug,
          title: pro?.title,
          verificationStatus: pro?.verificationStatus || 'unverified',
        },
        publishedAt: d.publishedAt?.toISOString(),
      };
    });

    return { items, total };
  }

  // ── DTO Mapper ──

  private toDto(d: ServiceDoc): ServiceDto {
    return {
      id: d._id,
      professionalProfileId: d.professionalProfileId,
      categoryId: d.categoryId,
      specialtyId: d.specialtyId,
      title: d.title,
      description: d.description,
      priceType: d.priceType,
      pricePiastres: d.pricePiastres,
      governorateId: d.governorateId,
      localityId: d.localityId,
      media: d.media.map((m) => ({ fileName: m.fileName, mimeType: m.mimeType })),
      status: d.status,
      rejectionReason: d.rejectionReason,
      publishedAt: d.publishedAt?.toISOString(),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
