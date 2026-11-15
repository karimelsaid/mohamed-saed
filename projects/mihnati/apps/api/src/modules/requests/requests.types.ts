export type ServiceRequestType = 'catalog' | 'custom';

export type ServiceRequestStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type OfferStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'superseded';

export interface ServiceRequestDoc {
  _id: string;
  customerId: string;
  type: ServiceRequestType;
  targetServiceId?: string;
  targetProfessionalId?: string; // If direct/catalog request
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  governorateId: string;
  localityId?: string;
  exactAddressText: string; // Private to customer, never in opportunity feed
  preferredDate?: Date;
  budgetPiastres?: number; // Integer piastres (optional customer estimate)
  status: ServiceRequestStatus;
  cycle: number; // Starts at 1; increments if reopened after cancellation
  acceptedOfferId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityDto {
  id: string;
  type: ServiceRequestType;
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  approximateLocation: {
    governorate: string;
    locality?: string;
  };
  preferredDate?: string;
  budgetPiastres?: number;
  cycle: number;
  offersCount: number;
  createdAt: string;
}

export interface ServiceRequestDto {
  id: string;
  customerId: string;
  type: ServiceRequestType;
  targetServiceId?: string;
  targetProfessionalId?: string;
  categoryId: string;
  specialtyId?: string;
  title: string;
  description: string;
  governorateId: string;
  localityId?: string;
  exactAddressText: string; // Visible only to owner customer
  preferredDate?: string;
  budgetPiastres?: number;
  status: ServiceRequestStatus;
  cycle: number;
  acceptedOfferId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferDoc {
  _id: string;
  serviceRequestId: string;
  cycle: number;
  professionalProfileId: string;
  professionalUserId: string;
  pricePiastres: number; // Integer piastres
  estimatedDurationDays?: number;
  notes: string;
  status: OfferStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OfferDto {
  id: string;
  serviceRequestId: string;
  cycle: number;
  professionalProfileId: string;
  pricePiastres: number;
  estimatedDurationDays?: number;
  notes: string;
  status: OfferStatus;
  professionalSummary?: {
    slug?: string;
    title?: string;
    verificationStatus: string;
  };
  createdAt: string;
}

export type ServiceOrderStatus =
  | 'created'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface ServiceOrderDoc {
  _id: string;
  serviceRequestId: string;
  offerId: string;
  customerId: string;
  professionalProfileId: string;
  professionalUserId: string;
  pricePiastres: number;
  status: ServiceOrderStatus;
  scopeSummary: string;
  agreedAt: Date;
  addressConsentGranted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceOrderDto {
  id: string;
  serviceRequestId: string;
  offerId: string;
  customerId: string;
  professionalProfileId: string;
  pricePiastres: number;
  status: ServiceOrderStatus;
  scopeSummary: string;
  agreedAt: string;
  addressConsentGranted: boolean;
  createdAt: string;
}
