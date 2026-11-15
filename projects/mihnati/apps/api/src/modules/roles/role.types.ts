export type MarketRoleKey = 'customer' | 'professional' | 'merchant';
export type InternalRoleKey = 'admin' | 'support';
export type RoleKey = MarketRoleKey | InternalRoleKey;

export type RoleAssignmentStatus = 'active' | 'inactive' | 'suspended';

export interface RoleAssignmentDoc {
  _id: string;
  userId: string;
  roleKey: RoleKey;
  status: RoleAssignmentStatus;
  grantedBy: string;
  grantedAt: Date;
  revokedAt?: Date;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerProfileDoc {
  _id: string;
  userId: string;
  preferredGovernorateId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type VerificationStatus = 'draft' | 'pending_review' | 'verified' | 'rejected' | 'needs_more_info';

export interface ProfessionalProfileDoc {
  _id: string;
  userId: string;
  slug?: string;
  title?: string;
  bio?: string;
  specialties?: string[];
  publicApproxLocation?: {
    governorate: string;
    locality?: string;
  };
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchantProfileDoc {
  _id: string;
  userId: string;
  businessName?: string;
  taxRegistrationNumber?: string;
  commercialRegistrationNumber?: string;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

