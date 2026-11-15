import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { VerificationService } from '../verification/verification.service.js';
import {
  ServiceRequestDoc,
  ServiceRequestDto,
  OpportunityDto,
  OfferDoc,
  OfferDto,
  ServiceOrderDoc,
  ServiceOrderDto,
  ServiceRequestType,
} from './requests.types.js';
import { ProfessionalProfileDoc } from '../roles/role.types.js';
import { GovernorateDoc, LocalityDoc } from '../geography/geography.types.js';
import { CategoryDoc, SpecialtyDoc } from '../taxonomy/taxonomy.types.js';

export interface CreateRequestInput {
  type?: ServiceRequestType;
  targetServiceId?: string;
  targetProfessionalId?: string;
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  governorateId: string;
  localityId?: string;
  exactAddressText: string;
  preferredDate?: Date;
  budgetPiastres?: number;
}

export interface SendOfferInput {
  pricePiastres: number;
  estimatedDurationDays?: number;
  notes: string;
}

export class RequestsService {
  constructor(private verificationService: VerificationService) {}

  private getRequestsCollection() {
    return getDb().collection<ServiceRequestDoc>('service_requests');
  }

  private getOffersCollection() {
    return getDb().collection<OfferDoc>('offers');
  }

  private getOrdersCollection() {
    return getDb().collection<ServiceOrderDoc>('service_orders');
  }

  // ── Customer Requests Management ──

  async createRequest(customerId: string, input: CreateRequestInput): Promise<ServiceRequestDto> {
    const db = getDb();

    // Validate category
    const category = await db.collection<CategoryDoc>('categories').findOne({
      _id: input.categoryId,
      type: 'service',
      status: 'active',
    });
    if (!category) {
      throw new ValidationError('Invalid or inactive service category');
    }

    // Validate specialty if given
    if (input.specialtyId) {
      const spec = await db.collection<SpecialtyDoc>('specialties').findOne({
        _id: input.specialtyId,
        categoryId: input.categoryId,
        status: 'active',
      });
      if (!spec) {
        throw new ValidationError('Specialty does not belong to selected category');
      }
    }

    // Validate governorate
    const gov = await db.collection<GovernorateDoc>('governorates').findOne({ _id: input.governorateId });
    if (!gov) {
      throw new ValidationError('Invalid governorate ID');
    }

    // Validate budget if given
    if (input.budgetPiastres !== undefined) {
      if (!Number.isInteger(input.budgetPiastres) || input.budgetPiastres < 0) {
        throw new ValidationError('Budget must be a non-negative integer in piastres');
      }
    }

    const now = new Date();
    const doc: ServiceRequestDoc = {
      _id: randomUUID(),
      customerId,
      type: input.type || 'custom',
      targetServiceId: input.targetServiceId,
      targetProfessionalId: input.targetProfessionalId,
      categoryId: input.categoryId,
      specialtyId: input.specialtyId,
      title: input.title.trim(),
      description: input.description.trim(),
      governorateId: input.governorateId,
      localityId: input.localityId,
      exactAddressText: input.exactAddressText.trim(),
      preferredDate: input.preferredDate,
      budgetPiastres: input.budgetPiastres,
      status: 'open',
      cycle: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.getRequestsCollection().insertOne(doc);
    return this.toRequestDto(doc);
  }

  async listMyRequests(customerId: string): Promise<ServiceRequestDto[]> {
    const list = await this.getRequestsCollection()
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();

    return list.map((r) => this.toRequestDto(r));
  }

  async getRequestById(customerId: string, requestId: string): Promise<ServiceRequestDto> {
    const doc = await this.getRequestsCollection().findOne({ _id: requestId });
    if (!doc) throw new NotFoundError('Service request not found');
    if (doc.customerId !== customerId) {
      throw new ForbiddenError('You do not own this service request');
    }
    return this.toRequestDto(doc);
  }

  // ── Opportunity Feed for Verified Professionals (AC-E07.1) ──

  async getOpportunityFeed(
    proUserId: string,
    filter?: {
      categoryId?: string;
      governorateId?: string;
      limit?: number;
      skip?: number;
    }
  ): Promise<OpportunityDto[]> {
    // 1. Enforce verified professional eligibility
    await this.verificationService.assertVerifiedProfessional(proUserId);

    const db = getDb();
    const query: Record<string, unknown> = {
      status: 'open',
    };

    if (filter?.categoryId) query['categoryId'] = filter.categoryId;
    if (filter?.governorateId) query['governorateId'] = filter.governorateId;

    const limit = Math.min(filter?.limit ?? 20, 50);
    const skip = filter?.skip ?? 0;

    const requests = await this.getRequestsCollection()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    if (requests.length === 0) return [];

    const govIds = [...new Set(requests.map((r) => r.governorateId))];
    const locIds = [...new Set(requests.map((r) => r.localityId).filter(Boolean))] as string[];

    const [govs, locs] = await Promise.all([
      db.collection<GovernorateDoc>('governorates').find({ _id: { $in: govIds } }).toArray(),
      db.collection<LocalityDoc>('localities').find({ _id: { $in: locIds } }).toArray(),
    ]);

    const govMap = new Map(govs.map((g) => [g._id, g.nameAr]));
    const locMap = new Map(locs.map((l) => [l._id, l.nameAr]));

    // Count offers per request
    const requestIds = requests.map((r) => r._id);
    const offersCounts = await this.getOffersCollection()
      .aggregate<{ _id: string; count: number }>([
        { $match: { serviceRequestId: { $in: requestIds }, status: { $ne: 'withdrawn' } } },
        { $group: { _id: '$serviceRequestId', count: { $sum: 1 } } },
      ])
      .toArray();
    const countMap = new Map(offersCounts.map((o) => [o._id, o.count]));

    return requests.map((r) => ({
      id: r._id,
      type: r.type,
      categoryId: r.categoryId,
      specialtyId: r.specialtyId,
      title: r.title,
      description: r.description,
      approximateLocation: {
        governorate: govMap.get(r.governorateId) || 'مصر',
        locality: r.localityId ? locMap.get(r.localityId) : undefined,
      },
      preferredDate: r.preferredDate?.toISOString(),
      budgetPiastres: r.budgetPiastres,
      cycle: r.cycle,
      offersCount: countMap.get(r._id) || 0,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Offer Creation & Sending (AC-E07.2) ──

  async sendOffer(
    proUserId: string,
    requestId: string,
    input: SendOfferInput
  ): Promise<OfferDto> {
    // 1. Enforce verified professional eligibility
    const pro = await this.verificationService.assertVerifiedProfessional(proUserId);

    const requestDoc = await this.getRequestsCollection().findOne({ _id: requestId });
    if (!requestDoc) throw new NotFoundError('Service request not found');

    if (requestDoc.status !== 'open') {
      throw new ConflictError(
        `Cannot send offer. Service request is in status "${requestDoc.status}".`
      );
    }

    if (!Number.isInteger(input.pricePiastres) || input.pricePiastres <= 0) {
      throw new ValidationError('Offer price must be a positive integer in piastres');
    }

    const col = this.getOffersCollection();

    // Check existing offer for this request + cycle + pro
    const existing = await col.findOne({
      serviceRequestId: requestId,
      cycle: requestDoc.cycle,
      professionalProfileId: pro._id,
    });

    const now = new Date();

    if (existing) {
      if (existing.status === 'accepted') {
        throw new ConflictError('Your offer for this request has already been accepted');
      }

      // Update existing offer with new terms and re-send
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            pricePiastres: input.pricePiastres,
            estimatedDurationDays: input.estimatedDurationDays,
            notes: input.notes.trim(),
            status: 'sent',
            updatedAt: now,
          },
        }
      );

      const updated = await col.findOne({ _id: existing._id });
      return this.toOfferDto(updated!, pro);
    }

    // Create new offer
    const doc: OfferDoc = {
      _id: randomUUID(),
      serviceRequestId: requestId,
      cycle: requestDoc.cycle,
      professionalProfileId: pro._id,
      professionalUserId: proUserId,
      pricePiastres: input.pricePiastres,
      estimatedDurationDays: input.estimatedDurationDays,
      notes: input.notes.trim(),
      status: 'sent',
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(doc);
    return this.toOfferDto(doc, pro);
  }

  async withdrawOffer(proUserId: string, offerId: string): Promise<OfferDto> {
    const col = this.getOffersCollection();
    const offer = await col.findOne({ _id: offerId });
    if (!offer) throw new NotFoundError('Offer not found');

    if (offer.professionalUserId !== proUserId) {
      throw new ForbiddenError('You do not own this offer');
    }

    if (offer.status !== 'sent') {
      throw new ConflictError(`Cannot withdraw offer in status "${offer.status}"`);
    }

    await col.updateOne(
      { _id: offerId },
      { $set: { status: 'withdrawn', updatedAt: new Date() } }
    );

    const updated = await col.findOne({ _id: offerId });
    return this.toOfferDto(updated!);
  }

  async listOffersForRequest(customerId: string, requestId: string): Promise<OfferDto[]> {
    const req = await this.getRequestById(customerId, requestId);
    const db = getDb();

    const offers = await this.getOffersCollection()
      .find({ serviceRequestId: requestId, cycle: req.cycle })
      .sort({ createdAt: -1 })
      .toArray();

    if (offers.length === 0) return [];

    const proProfileIds = [...new Set(offers.map((o) => o.professionalProfileId))];
    const pros = await db
      .collection<ProfessionalProfileDoc>('professional_profiles')
      .find({ _id: { $in: proProfileIds } })
      .toArray();
    const proMap = new Map(pros.map((p) => [p._id, p]));

    return offers.map((o) => this.toOfferDto(o, proMap.get(o.professionalProfileId)));
  }

  // ── Atomic Accept & Agreement (AC-E07.3) ──

  async acceptOffer(
    customerId: string,
    requestId: string,
    offerId: string
  ): Promise<ServiceOrderDto> {
    const requestDoc = await this.getRequestsCollection().findOne({ _id: requestId });
    if (!requestDoc) throw new NotFoundError('Service request not found');

    if (requestDoc.customerId !== customerId) {
      throw new ForbiddenError('You do not own this service request');
    }

    if (requestDoc.status !== 'open') {
      throw new ConflictError(
        `Cannot accept offer. Request is already in status "${requestDoc.status}".`
      );
    }

    const offerDoc = await this.getOffersCollection().findOne({ _id: offerId });
    if (!offerDoc) throw new NotFoundError('Offer not found');

    if (offerDoc.serviceRequestId !== requestId || offerDoc.cycle !== requestDoc.cycle) {
      throw new ValidationError('Offer does not belong to the current cycle of this request');
    }

    if (offerDoc.status !== 'sent') {
      throw new ConflictError(`Cannot accept offer in status "${offerDoc.status}"`);
    }

    const now = new Date();

    // 1. Mark selected offer as accepted
    await this.getOffersCollection().updateOne(
      { _id: offerId },
      { $set: { status: 'accepted', updatedAt: now } }
    );

    // 2. Mark all competing sent offers as superseded
    await this.getOffersCollection().updateMany(
      {
        serviceRequestId: requestId,
        cycle: requestDoc.cycle,
        _id: { $ne: offerId },
        status: 'sent',
      },
      { $set: { status: 'superseded', updatedAt: now } }
    );

    // 3. Update request status to in_progress
    await this.getRequestsCollection().updateOne(
      { _id: requestId },
      {
        $set: {
          status: 'in_progress',
          acceptedOfferId: offerId,
          updatedAt: now,
        },
      }
    );

    // 4. Create ServiceOrder record (Agreement)
    const orderDoc: ServiceOrderDoc = {
      _id: randomUUID(),
      serviceRequestId: requestId,
      offerId,
      customerId,
      professionalProfileId: offerDoc.professionalProfileId,
      professionalUserId: offerDoc.professionalUserId,
      pricePiastres: offerDoc.pricePiastres,
      status: 'created',
      scopeSummary: requestDoc.title,
      agreedAt: now,
      addressConsentGranted: false, // Explicit consent needed in E08
      createdAt: now,
      updatedAt: now,
    };

    await this.getOrdersCollection().insertOne(orderDoc);

    return {
      id: orderDoc._id,
      serviceRequestId: orderDoc.serviceRequestId,
      offerId: orderDoc.offerId,
      customerId: orderDoc.customerId,
      professionalProfileId: orderDoc.professionalProfileId,
      pricePiastres: orderDoc.pricePiastres,
      status: orderDoc.status,
      scopeSummary: orderDoc.scopeSummary,
      agreedAt: orderDoc.agreedAt.toISOString(),
      addressConsentGranted: orderDoc.addressConsentGranted,
      createdAt: orderDoc.createdAt.toISOString(),
    };
  }

  // ── Reopen Request (Cycle + 1) (AC-E07.3) ──

  async reopenRequest(customerId: string, requestId: string): Promise<ServiceRequestDto> {
    const doc = await this.getRequestsCollection().findOne({ _id: requestId });
    if (!doc) throw new NotFoundError('Service request not found');

    if (doc.customerId !== customerId) {
      throw new ForbiddenError('You do not own this service request');
    }

    if (doc.status !== 'cancelled' && doc.status !== 'in_progress') {
      throw new ConflictError(
        `Cannot reopen request in status "${doc.status}". Only cancelled or interrupted requests can be reopened.`
      );
    }

    const now = new Date();
    const newCycle = doc.cycle + 1;

    await this.getRequestsCollection().updateOne(
      { _id: requestId },
      {
        $set: {
          status: 'open',
          cycle: newCycle,
          acceptedOfferId: undefined,
          updatedAt: now,
        },
      }
    );

    const updated = await this.getRequestsCollection().findOne({ _id: requestId });
    return this.toRequestDto(updated!);
  }

  // ── Private DTO helpers ──

  private toRequestDto(d: ServiceRequestDoc): ServiceRequestDto {
    return {
      id: d._id,
      customerId: d.customerId,
      type: d.type,
      targetServiceId: d.targetServiceId,
      targetProfessionalId: d.targetProfessionalId,
      categoryId: d.categoryId,
      specialtyId: d.specialtyId,
      title: d.title,
      description: d.description,
      governorateId: d.governorateId,
      localityId: d.localityId,
      exactAddressText: d.exactAddressText,
      preferredDate: d.preferredDate?.toISOString(),
      budgetPiastres: d.budgetPiastres,
      status: d.status,
      cycle: d.cycle,
      acceptedOfferId: d.acceptedOfferId,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  private toOfferDto(d: OfferDoc, pro?: ProfessionalProfileDoc): OfferDto {
    return {
      id: d._id,
      serviceRequestId: d.serviceRequestId,
      cycle: d.cycle,
      professionalProfileId: d.professionalProfileId,
      pricePiastres: d.pricePiastres,
      estimatedDurationDays: d.estimatedDurationDays,
      notes: d.notes,
      status: d.status,
      professionalSummary: pro
        ? {
            slug: pro.slug,
            title: pro.title,
            verificationStatus: pro.verificationStatus,
          }
        : undefined,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
