import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  RateLimitedError,
  RetryableTransactionError,
  InternalError,
} from '../../../src/platform/http/errors.js';

describe('AppError hierarchy', () => {
  it('AppError should carry code, statusCode, message, details', () => {
    const err = new AppError('CONFLICT', 409, 'Duplicate entry', { field: 'phone' });
    expect(err.code).toBe('CONFLICT');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Duplicate entry');
    expect(err.details).toEqual({ field: 'phone' });
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('ValidationError maps to 400 VALIDATION_ERROR', () => {
    const err = new ValidationError('Invalid input', { field: 'email' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('UnauthenticatedError maps to 401', () => {
    const err = new UnauthenticatedError();
    expect(err.code).toBe('UNAUTHENTICATED');
    expect(err.statusCode).toBe(401);
  });

  it('ForbiddenError maps to 403', () => {
    const err = new ForbiddenError();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
  });

  it('NotFoundError maps to 404', () => {
    const err = new NotFoundError();
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('ConflictError maps to 409', () => {
    const err = new ConflictError('Already exists');
    expect(err.code).toBe('CONFLICT');
    expect(err.statusCode).toBe(409);
  });

  it('ConflictError with custom code', () => {
    const err = new ConflictError('Stale data', 'STALE_VERSION');
    expect(err.code).toBe('STALE_VERSION');
    expect(err.statusCode).toBe(409);
  });

  it('BusinessRuleError maps to 422', () => {
    const err = new BusinessRuleError('Cannot accept expired offer');
    expect(err.code).toBe('BUSINESS_RULE_FAILED');
    expect(err.statusCode).toBe(422);
  });

  it('RateLimitedError maps to 429', () => {
    const err = new RateLimitedError();
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.statusCode).toBe(429);
  });

  it('RetryableTransactionError maps to 503', () => {
    const err = new RetryableTransactionError();
    expect(err.code).toBe('RETRYABLE_TRANSACTION_FAILURE');
    expect(err.statusCode).toBe(503);
  });

  it('InternalError maps to 500 and is non-operational', () => {
    const err = new InternalError();
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(false);
  });
});

