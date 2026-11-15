export type AccountStatus =
  | 'active'
  | 'suspended'
  | 'deactivation_requested'
  | 'deactivated'
  | 'deletion_pending'
  | 'anonymized'
  | 'deleted';

export interface UserDoc {
  _id: string;
  phone: string;
  email?: string;
  passwordHash: string;
  status: AccountStatus;
  locale: 'ar' | 'en';
  name: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: string;
  userId: string;
  refreshTokenHash: string;
  tokenFamily: string;
  isRevoked: boolean;
  revokedReason?: string;
  ipAddress?: string;
  userAgent?: string;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface OtpChallengeDoc {
  _id: string;
  phone: string;
  codeHash: string;
  purpose: 'registration' | 'login' | 'password_reset';
  attempts: number;
  verifiedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface UserProfileDto {
  id: string;
  phone: string;
  name: string;
  locale: 'ar' | 'en';
  status: AccountStatus;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

