export type PriceType = 'fixed' | 'from' | 'inspection';

export type ServiceStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'paused'
  | 'archived'
  | 'rejected';

export interface ServiceMedia {
  fileKey: string;
  url?: string;
  fileName: string;
  mimeType: string;
}

export interface ServiceDoc {
  _id: string;
  professionalProfileId: string;
  userId: string;
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  priceType: PriceType;
  pricePiastres: number; // Integer piastres (e.g., 15000 = 150.00 EGP)
  governorateId: string;
  localityId?: string;
  media: ServiceMedia[];
  status: ServiceStatus;
  rejectionReason?: string;
  moderatorNotes?: string;
  publishedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceDto {
  id: string;
  professionalProfileId: string;
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  priceType: PriceType;
  pricePiastres: number;
  governorateId: string;
  localityId?: string;
  media: Array<{
    fileName: string;
    mimeType: string;
  }>;
  status: ServiceStatus;
  rejectionReason?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicServiceDto {
  id: string;
  title: string;
  description: string;
  priceType: PriceType;
  pricePiastres: number;
  categoryId: string;
  specialtyId?: string;
  media: Array<{
    fileName: string;
    mimeType: string;
  }>;
  approximateLocation: {
    governorate: string;
    locality?: string;
  };
  professional: {
    slug?: string;
    title?: string;
    verificationStatus: string;
  };
  publishedAt?: string;
}

