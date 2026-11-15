import type { ErrorCode } from '@mihnati/contracts';

/**
 * Base application error. All domain/platform errors extend this.
 * Maps to the standard Mihnati API error envelope.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
    isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// --- Concrete error subclasses ---

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', 401, message);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', 403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', 404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = 'CONFLICT', details?: Record<string, unknown>) {
    super(code, 409, message, details);
    this.name = 'ConflictError';
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('BUSINESS_RULE_FAILED', 422, message, details);
    this.name = 'BusinessRuleError';
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', 429, message);
    this.name = 'RateLimitedError';
  }
}

export class RetryableTransactionError extends AppError {
  constructor(message = 'Transient transaction failure, please retry') {
    super('RETRYABLE_TRANSACTION_FAILURE', 503, message);
    this.name = 'RetryableTransactionError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'An internal error occurred') {
    super('INTERNAL_ERROR', 500, message, undefined, false);
    this.name = 'InternalError';
  }
}

