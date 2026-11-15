export interface GovernorateDoc {
  _id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}

export type LocalityType = 'center' | 'city' | 'district' | 'village' | 'area';

export interface LocalityDoc {
  _id: string;
  governorateId: string;
  parentId?: string;
  nameAr: string;
  nameEn: string;
  normalizedSlug: string;
  type: LocalityType;
}

export interface AddressDoc {
  _id: string;
  ownerId: string;
  governorateId: string;
  localityId: string;
  exactAddressText: string;
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  isDefault: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  approximateLocation: {
    governorate: string;
    locality?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AddressDto {
  id: string;
  governorateId: string;
  localityId: string;
  exactAddressText: string;
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  isDefault: boolean;
  approximateLocation: {
    governorate: string;
    locality?: string;
  };
  createdAt: string;
}

