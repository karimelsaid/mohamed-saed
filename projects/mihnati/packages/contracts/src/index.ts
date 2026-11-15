/**
 * Mihnati Platform — Shared Contracts & Types
 * Derived from API-SPECIFICATION.md and openapi.yaml
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_KEY_EXPIRED'
  | 'STALE_VERSION'
  | 'CART_STORE_MISMATCH'
  | 'INSUFFICIENT_STOCK'
  | 'DUPLICATE_DISPUTE'
  | 'DUPLICATE_REVIEW'
  | 'BILLING_GATE_CLOSED'
  | 'DUPLICATE_SUBSCRIPTION'
  | 'CAMPAIGN_BUDGET_EXHAUSTED'
  | 'SENSITIVE_TARGETING_PROHIBITED'
  | 'EXPORT_EXPIRED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'BUSINESS_RULE_FAILED'
  | 'RATE_LIMITED'
  | 'RETRYABLE_TRANSACTION_FAILURE'
  | 'INTERNAL_ERROR';

export interface ResponseMeta {
  requestId: string;
  version?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

export interface SuccessEnvelope<T> {
  data: T;
  meta: ResponseMeta;
}

export interface ListEnvelope<T> {
  data: T[];
  pagination: PaginationMeta;
  meta: ResponseMeta;
}

export interface ErrorDetail {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}

export interface HealthData {
  status: 'pass' | 'fail';
  timestamp: string;
  uptime: number;
}

export interface ReadyCheckItem {
  status: 'pass' | 'fail';
  message?: string;
  details?: Record<string, unknown>;
}

export interface ReadyData {
  status: 'pass' | 'fail';
  timestamp: string;
  checks: Record<string, ReadyCheckItem>;
}

export type HealthResponse = SuccessEnvelope<HealthData>;
export type ReadyResponse = SuccessEnvelope<ReadyData>;

export type AccountStatus =
  | 'active'
  | 'suspended'
  | 'deactivation_requested'
  | 'deactivated'
  | 'deletion_pending'
  | 'anonymized'
  | 'deleted';

export interface UserProfileDto {
  id: string;
  phone: string;
  name: string;
  locale: 'ar' | 'en';
  status: AccountStatus;
  createdAt: string;
}

export interface UserSessionDto {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

