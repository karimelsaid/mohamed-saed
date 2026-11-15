import { getDb } from '../../platform/database/connection.js';
import {
  CustomerProfileDoc,
  ProfessionalProfileDoc,
  MerchantProfileDoc,
} from '../roles/role.types.js';
import { NotFoundError, ConflictError } from '../../platform/http/errors.js';

export class ProfileService {
  private getCustomerCollection() {
    return getDb().collection<CustomerProfileDoc>('customer_profiles');
  }

  private getProfessionalCollection() {
    return getDb().collection<ProfessionalProfileDoc>('professional_profiles');
  }

  private getMerchantCollection() {
    return getDb().collection<MerchantProfileDoc>('merchant_profiles');
  }

  // ── Customer Profile ──
  async getCustomerProfile(userId: string): Promise<CustomerProfileDoc> {
    const col = this.getCustomerCollection();
    const profile = await col.findOne({ userId });
    if (!profile) {
      throw new NotFoundError('Customer profile not found. Please activate customer role first.');
    }
    return profile;
  }

  async updateCustomerProfile(userId: string, data: { preferredGovernorateId?: string; notes?: string }): Promise<CustomerProfileDoc> {
    const col = this.getCustomerCollection();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.preferredGovernorateId !== undefined) updates['preferredGovernorateId'] = data.preferredGovernorateId;
    if (data.notes !== undefined) updates['notes'] = data.notes;

    const result = await col.findOneAndUpdate(
      { userId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new NotFoundError('Customer profile not found');
    }
    return result;
  }

  // ── Professional Profile ──
  async getProfessionalProfile(userId: string): Promise<ProfessionalProfileDoc> {
    const col = this.getProfessionalCollection();
    const profile = await col.findOne({ userId });
    if (!profile) {
      throw new NotFoundError('Professional profile not found. Please activate professional role first.');
    }
    return profile;
  }

  async updateProfessionalProfile(
    userId: string,
    data: {
      title?: string;
      bio?: string;
      specialties?: string[];
      slug?: string;
      publicApproxLocation?: { governorate: string; locality?: string };
    }
  ): Promise<ProfessionalProfileDoc> {
    const col = this.getProfessionalCollection();

    // Check slug uniqueness if provided
    if (data.slug) {
      const existingSlug = await col.findOne({ slug: data.slug, userId: { $ne: userId } });
      if (existingSlug) {
        throw new ConflictError('A professional profile with this slug already exists', 'CONFLICT', { field: 'slug' });
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updates['title'] = data.title;
    if (data.bio !== undefined) updates['bio'] = data.bio;
    if (data.specialties !== undefined) updates['specialties'] = data.specialties;
    if (data.slug !== undefined) updates['slug'] = data.slug;
    if (data.publicApproxLocation !== undefined) updates['publicApproxLocation'] = data.publicApproxLocation;

    const result = await col.findOneAndUpdate(
      { userId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new NotFoundError('Professional profile not found');
    }
    return result;
  }

  // ── Merchant Profile ──
  async getMerchantProfile(userId: string): Promise<MerchantProfileDoc> {
    const col = this.getMerchantCollection();
    const profile = await col.findOne({ userId });
    if (!profile) {
      throw new NotFoundError('Merchant profile not found. Please activate merchant role first.');
    }
    return profile;
  }

  async updateMerchantProfile(
    userId: string,
    data: {
      businessName?: string;
      taxRegistrationNumber?: string;
      commercialRegistrationNumber?: string;
    }
  ): Promise<MerchantProfileDoc> {
    const col = this.getMerchantCollection();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.businessName !== undefined) updates['businessName'] = data.businessName;
    if (data.taxRegistrationNumber !== undefined) updates['taxRegistrationNumber'] = data.taxRegistrationNumber;
    if (data.commercialRegistrationNumber !== undefined) updates['commercialRegistrationNumber'] = data.commercialRegistrationNumber;

    const result = await col.findOneAndUpdate(
      { userId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new NotFoundError('Merchant profile not found');
    }
    return result;
  }
}

