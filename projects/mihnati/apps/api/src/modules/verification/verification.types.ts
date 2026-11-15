import { VerificationStatus } from '../roles/role.types.js';

export type VerificationProfileType = 'professional' | 'merchant';

export type VerificationDocumentType =
  | 'national_id_front'
  | 'national_id_back'
  | 'criminal_record'
  | 'syndicate_card'
  | 'commercial_reg'
  | 'tax_card'
  | 'other';

export interface VerificationDocument {
  type: VerificationDocumentType;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface VerificationCaseDoc {
  _id: string;
  userId: string;
  profileType: VerificationProfileType;
  status: VerificationStatus;
  documents: VerificationDocument[];
  applicantNotes?: string;
  assignedReviewerId?: string;
  reviewerDecisionNotes?: string;
  decidedAt?: Date;
  decidedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationCaseDto {
  id: string;
  userId: string;
  profileType: VerificationProfileType;
  status: VerificationStatus;
  documents: Array<{
    type: VerificationDocumentType;
    fileName: string;
    mimeType: string;
    uploadedAt: string;
  }>;
  applicantNotes?: string;
  reviewerDecisionNotes?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface PortfolioAttachment {
  fileKey: string;
  fileName: string;
  mimeType: string;
}

export interface PortfolioItemDoc {
  _id: string;
  professionalProfileId: string;
  userId: string;
  title: string;
  description?: string;
  attachments: PortfolioAttachment[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioItemDto {
  id: string;
  title: string;
  description?: string;
  attachments: Array<{
    fileName: string;
    mimeType: string;
  }>;
  sortOrder: number;
  createdAt: string;
}

export interface PublicProfessionalProfileDto {
  slug?: string;
  title?: string;
  bio?: string;
  specialties?: string[];
  publicApproxLocation?: {
    governorate: string;
    locality?: string;
  };
  verificationStatus: VerificationStatus;
  portfolio: PortfolioItemDto[];
}

