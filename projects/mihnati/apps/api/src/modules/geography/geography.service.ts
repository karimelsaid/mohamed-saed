import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../platform/http/errors.js';
import {
  GovernorateDoc,
  LocalityDoc,
  AddressDoc,
  AddressDto,
} from './geography.types.js';

// Standard Egyptian Governorates Seed Data
export const EGYPT_GOVERNORATES: Omit<GovernorateDoc, '_id'>[] = [
  { code: 'CAI', nameAr: 'القاهرة', nameEn: 'Cairo' },
  { code: 'GZ', nameAr: 'الجيزة', nameEn: 'Giza' },
  { code: 'ALX', nameAr: 'الإسكندرية', nameEn: 'Alexandria' },
  { code: 'DK', nameAr: 'الدقهلية', nameEn: 'Dakahlia' },
  { code: 'SHR', nameAr: 'الشرقية', nameEn: 'Sharqia' },
  { code: 'GH', nameAr: 'الغربية', nameEn: 'Gharbia' },
  { code: 'QLY', nameAr: 'القليوبية', nameEn: 'Qalyubia' },
  { code: 'MNF', nameAr: 'المنوفية', nameEn: 'Menofia' },
  { code: 'BH', nameAr: 'البحيرة', nameEn: 'Beheira' },
  { code: 'ISM', nameAr: 'الإسماعيلية', nameEn: 'Ismailia' },
  { code: 'SUZ', nameAr: 'السويس', nameEn: 'Suez' },
  { code: 'PTS', nameAr: 'بورسعيد', nameEn: 'Port Said' },
  { code: 'DM', nameAr: 'دمياط', nameEn: 'Damietta' },
  { code: 'KFS', nameAr: 'كفر الشيخ', nameEn: 'Kafr El Sheikh' },
  { code: 'FYM', nameAr: 'الفيوم', nameEn: 'Faiyum' },
  { code: 'BNS', nameAr: 'بني سويف', nameEn: 'Beni Suef' },
  { code: 'MN', nameAr: 'المنيا', nameEn: 'Minya' },
  { code: 'AST', nameAr: 'أسيوط', nameEn: 'Asyut' },
  { code: 'SHG', nameAr: 'سوهاج', nameEn: 'Sohag' },
  { code: 'QN', nameAr: 'قنا', nameEn: 'Qena' },
  { code: 'LX', nameAr: 'الأقصر', nameEn: 'Luxor' },
  { code: 'ASN', nameAr: 'أسوان', nameEn: 'Aswan' },
  { code: 'RSE', nameAr: 'البحر الأحمر', nameEn: 'Red Sea' },
  { code: 'NV', nameAr: 'الوادي الجديد', nameEn: 'New Valley' },
  { code: 'MT', nameAr: 'مطروح', nameEn: 'Matrouh' },
  { code: 'NSN', nameAr: 'شمال سيناء', nameEn: 'North Sinai' },
  { code: 'SSN', nameAr: 'جنوب سيناء', nameEn: 'South Sinai' },
];

export interface CreateAddressInput {
  governorateId: string;
  localityId: string;
  exactAddressText: string;
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  isDefault?: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface UpdateAddressInput {
  governorateId?: string;
  localityId?: string;
  exactAddressText?: string;
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  isDefault?: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export class GeographyService {
  /**
   * Seed governorates and sample localities if collection is empty.
   */
  async seedIfEmpty(): Promise<void> {
    const db = getDb();
    const count = await db.collection<GovernorateDoc>('governorates').countDocuments();
    if (count > 0) return;

    for (const gov of EGYPT_GOVERNORATES) {
      const govId = randomUUID();
      await db.collection<GovernorateDoc>('governorates').insertOne({
        _id: govId,
        code: gov.code,
        nameAr: gov.nameAr,
        nameEn: gov.nameEn,
      });

      // Seed core localities for major governorates
      if (gov.code === 'CAI') {
        const cairoDistricts = [
          { nameAr: 'مدينة نصر', nameEn: 'Nasr City', slug: 'nasr-city' },
          { nameAr: 'المعادي', nameEn: 'Maadi', slug: 'maadi' },
          { nameAr: 'مصر الجديدة', nameEn: 'Heliopolis', slug: 'heliopolis' },
          { nameAr: 'التجمع الخامس', nameEn: 'Fifth Settlement', slug: 'fifth-settlement' },
          { nameAr: 'شبرا', nameEn: 'Shubra', slug: 'shubra' },
        ];
        for (const dist of cairoDistricts) {
          await db.collection<LocalityDoc>('localities').insertOne({
            _id: randomUUID(),
            governorateId: govId,
            nameAr: dist.nameAr,
            nameEn: dist.nameEn,
            normalizedSlug: dist.slug,
            type: 'district',
          });
        }
      } else if (gov.code === 'GZ') {
        const gizaDistricts = [
          { nameAr: 'الدقي', nameEn: 'Dokki', slug: 'dokki' },
          { nameAr: 'المهندسين', nameEn: 'Mohandessin', slug: 'mohandessin' },
          { nameAr: 'الهرم', nameEn: 'Haram', slug: 'haram' },
          { nameAr: 'مدينة 6 أكتوبر', nameEn: '6th of October', slug: '6th-of-october' },
          { nameAr: 'الشيخ زايد', nameEn: 'Sheikh Zayed', slug: 'sheikh-zayed' },
        ];
        for (const dist of gizaDistricts) {
          await db.collection<LocalityDoc>('localities').insertOne({
            _id: randomUUID(),
            governorateId: govId,
            nameAr: dist.nameAr,
            nameEn: dist.nameEn,
            normalizedSlug: dist.slug,
            type: 'district',
          });
        }
      } else if (gov.code === 'ALX') {
        const alexDistricts = [
          { nameAr: 'سموحة', nameEn: 'Smouha', slug: 'smouha' },
          { nameAr: 'سيدي جابر', nameEn: 'Sidi Gaber', slug: 'sidi-gaber' },
          { nameAr: 'محرم بك', nameEn: 'Moharam Bek', slug: 'moharam-bek' },
          { nameAr: 'العجمي', nameEn: 'Agami', slug: 'agami' },
        ];
        for (const dist of alexDistricts) {
          await db.collection<LocalityDoc>('localities').insertOne({
            _id: randomUUID(),
            governorateId: govId,
            nameAr: dist.nameAr,
            nameEn: dist.nameEn,
            normalizedSlug: dist.slug,
            type: 'district',
          });
        }
      }
    }
  }

  /**
   * List all governorates.
   */
  async listGovernorates(): Promise<GovernorateDoc[]> {
    const db = getDb();
    return db.collection<GovernorateDoc>('governorates').find().sort({ code: 1 }).toArray();
  }

  /**
   * Get a governorate by ID or code.
   */
  async getGovernorate(idOrCode: string): Promise<GovernorateDoc> {
    const db = getDb();
    const gov = await db.collection<GovernorateDoc>('governorates').findOne({
      $or: [{ _id: idOrCode }, { code: idOrCode }],
    });
    if (!gov) {
      throw new NotFoundError('Governorate not found');
    }
    return gov;
  }

  /**
   * List localities for a governorate with optional filtering.
   */
  async listLocalities(params: {
    governorateId: string;
    parentId?: string;
    type?: string;
  }): Promise<LocalityDoc[]> {
    const db = getDb();
    const filter: Record<string, unknown> = {
      governorateId: params.governorateId,
    };
    if (params.parentId) {
      filter['parentId'] = params.parentId;
    }
    if (params.type) {
      filter['type'] = params.type;
    }

    return db.collection<LocalityDoc>('localities').find(filter).sort({ nameAr: 1 }).toArray();
  }

  /**
   * Add a locality (useful for seeding or admin).
   */
  async createLocality(data: Omit<LocalityDoc, '_id'>): Promise<LocalityDoc> {
    const db = getDb();
    // Validate governorate exists
    await this.getGovernorate(data.governorateId);

    if (data.parentId) {
      const parent = await db.collection<LocalityDoc>('localities').findOne({
        _id: data.parentId,
        governorateId: data.governorateId,
      });
      if (!parent) {
        throw new ValidationError('Parent locality does not belong to the same governorate');
      }
    }

    const doc: LocalityDoc = {
      _id: randomUUID(),
      ...data,
    };
    await db.collection<LocalityDoc>('localities').insertOne(doc);
    return doc;
  }

  /**
   * Create an address for a user.
   * Enforces Egyptian manual hierarchy: valid governorate and locality.
   */
  async createAddress(ownerId: string, input: CreateAddressInput): Promise<AddressDto> {
    const db = getDb();

    // Validate governorate
    const gov = await db.collection<GovernorateDoc>('governorates').findOne({ _id: input.governorateId });
    if (!gov) {
      throw new ValidationError('Invalid governorate ID');
    }

    // Validate locality
    const loc = await db.collection<LocalityDoc>('localities').findOne({
      _id: input.localityId,
      governorateId: input.governorateId,
    });
    if (!loc) {
      throw new ValidationError('Locality does not belong to the selected governorate');
    }

    // Check existing addresses count to decide default
    const existingCount = await db.collection<AddressDoc>('addresses').countDocuments({ ownerId });
    const isDefault = input.isDefault ?? existingCount === 0;

    if (isDefault) {
      await db.collection<AddressDoc>('addresses').updateMany(
        { ownerId },
        { $set: { isDefault: false, updatedAt: new Date() } }
      );
    }

    const now = new Date();
    const doc: AddressDoc = {
      _id: randomUUID(),
      ownerId,
      governorateId: input.governorateId,
      localityId: input.localityId,
      exactAddressText: input.exactAddressText.trim(),
      buildingNumber: input.buildingNumber?.trim(),
      floor: input.floor?.trim(),
      apartment: input.apartment?.trim(),
      isDefault,
      coordinates: input.coordinates,
      approximateLocation: {
        governorate: gov.nameAr,
        locality: loc.nameAr,
      },
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<AddressDoc>('addresses').insertOne(doc);
    return this.toDto(doc);
  }

  /**
   * List all addresses for an owner.
   */
  async listAddresses(ownerId: string): Promise<AddressDto[]> {
    const db = getDb();
    const addresses = await db
      .collection<AddressDoc>('addresses')
      .find({ ownerId })
      .sort({ isDefault: -1, createdAt: -1 })
      .toArray();

    return addresses.map((a) => this.toDto(a));
  }

  /**
   * Get a single address by ID, ensuring owner isolation.
   */
  async getAddress(ownerId: string, addressId: string): Promise<AddressDoc> {
    const db = getDb();
    const address = await db.collection<AddressDoc>('addresses').findOne({ _id: addressId });
    if (!address) {
      throw new NotFoundError('Address not found');
    }
    if (address.ownerId !== ownerId) {
      throw new ForbiddenError('You do not have access to this address');
    }
    return address;
  }

  /**
   * Update an address.
   */
  async updateAddress(
    ownerId: string,
    addressId: string,
    input: UpdateAddressInput
  ): Promise<AddressDto> {
    const db = getDb();
    const address = await this.getAddress(ownerId, addressId);

    const updateFields: Partial<AddressDoc> = {
      updatedAt: new Date(),
    };

    let govName = address.approximateLocation.governorate;
    let locName = address.approximateLocation.locality;

    const newGovId = input.governorateId ?? address.governorateId;
    const newLocId = input.localityId ?? address.localityId;

    if (input.governorateId || input.localityId) {
      const gov = await db.collection<GovernorateDoc>('governorates').findOne({ _id: newGovId });
      if (!gov) {
        throw new ValidationError('Invalid governorate ID');
      }
      const loc = await db.collection<LocalityDoc>('localities').findOne({
        _id: newLocId,
        governorateId: newGovId,
      });
      if (!loc) {
        throw new ValidationError('Locality does not belong to the selected governorate');
      }
      updateFields.governorateId = newGovId;
      updateFields.localityId = newLocId;
      govName = gov.nameAr;
      locName = loc.nameAr;
      updateFields.approximateLocation = {
        governorate: govName,
        locality: locName,
      };
    }

    if (input.exactAddressText !== undefined) {
      updateFields.exactAddressText = input.exactAddressText.trim();
    }
    if (input.buildingNumber !== undefined) {
      updateFields.buildingNumber = input.buildingNumber.trim();
    }
    if (input.floor !== undefined) {
      updateFields.floor = input.floor.trim();
    }
    if (input.apartment !== undefined) {
      updateFields.apartment = input.apartment.trim();
    }
    if (input.coordinates !== undefined) {
      updateFields.coordinates = input.coordinates;
    }

    if (input.isDefault) {
      await db.collection<AddressDoc>('addresses').updateMany(
        { ownerId },
        { $set: { isDefault: false, updatedAt: new Date() } }
      );
      updateFields.isDefault = true;
    }

    await db.collection<AddressDoc>('addresses').updateOne(
      { _id: addressId },
      { $set: updateFields }
    );

    const updated = await this.getAddress(ownerId, addressId);
    return this.toDto(updated);
  }

  /**
   * Delete an address.
   */
  async deleteAddress(ownerId: string, addressId: string): Promise<void> {
    const db = getDb();
    const address = await this.getAddress(ownerId, addressId);

    await db.collection<AddressDoc>('addresses').deleteOne({ _id: addressId });

    // If it was default, promote another address to default
    if (address.isDefault) {
      const next = await db
        .collection<AddressDoc>('addresses')
        .findOne({ ownerId }, { sort: { createdAt: -1 } });
      if (next) {
        await db
          .collection<AddressDoc>('addresses')
          .updateOne({ _id: next._id }, { $set: { isDefault: true, updatedAt: new Date() } });
      }
    }
  }

  /**
   * Set an address as the default address.
   */
  async setDefault(ownerId: string, addressId: string): Promise<AddressDto> {
    const db = getDb();
    await this.getAddress(ownerId, addressId);

    await db.collection<AddressDoc>('addresses').updateMany(
      { ownerId },
      { $set: { isDefault: false, updatedAt: new Date() } }
    );

    await db.collection<AddressDoc>('addresses').updateOne(
      { _id: addressId },
      { $set: { isDefault: true, updatedAt: new Date() } }
    );

    const updated = await this.getAddress(ownerId, addressId);
    return this.toDto(updated);
  }

  /**
   * Convert an AddressDoc to public/client AddressDto.
   * Strips internal metadata. Note: exactAddressText is only accessible by the owner in /me/addresses.
   */
  private toDto(doc: AddressDoc): AddressDto {
    return {
      id: doc._id,
      governorateId: doc.governorateId,
      localityId: doc.localityId,
      exactAddressText: doc.exactAddressText,
      buildingNumber: doc.buildingNumber,
      floor: doc.floor,
      apartment: doc.apartment,
      isDefault: doc.isDefault,
      approximateLocation: doc.approximateLocation,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}

export const geographyService = new GeographyService();

