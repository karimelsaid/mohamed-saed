export type ServiceOrderStatus =
  | 'created'
  | 'scheduled'
  | 'in_progress'
  | 'submitted'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export type AppointmentStatus =
  | 'proposed'
  | 'confirmed'
  | 'rescheduled'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface ServiceOrderDoc {
  _id: string;
  serviceRequestId: string;
  offerId: string;
  customerId: string;
  professionalProfileId: string;
  professionalUserId: string;
  pricePiastres: number; // Integer piastres
  status: ServiceOrderStatus;
  scopeSummary: string;
  addressConsentGranted: boolean;
  addressConsentGrantedAt?: Date;
  addressConsentRevokedAt?: Date;
  scheduledAppointmentAt?: Date;
  submittedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  disputeReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentDoc {
  _id: string;
  serviceOrderId: string;
  proposedBy: 'customer' | 'professional';
  scheduledAt: Date;
  timezone: string; // IANA timezone e.g. "Africa/Cairo"
  notes?: string;
  status: AppointmentStatus;
  noShowActor?: 'customer' | 'professional';
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderChangeRequestDoc {
  _id: string;
  serviceOrderId: string;
  requestedBy: string; // userId
  proposedPricePiastres?: number;
  proposedScopeSummary?: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  decidedBy?: string;
  decidedAt?: Date;
  decisionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddressConsentLogDoc {
  _id: string;
  serviceOrderId: string;
  actorId: string;
  action: 'granted' | 'revoked' | 'revealed';
  ip?: string;
  requestId?: string;
  createdAt: Date;
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
  addressConsentGranted: boolean;
  scheduledAppointmentAt?: string;
  submittedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionAddressDto {
  serviceOrderId: string;
  governorate: string;
  locality?: string;
  exactAddressText: string;
  revealedAt: string;
}

