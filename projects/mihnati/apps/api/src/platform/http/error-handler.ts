import type { Request, Response, NextFunction } from 'express';
import type { ErrorEnvelope } from '@mihnati/contracts';
import { AppError } from './errors.js';
import { logger, redactSensitiveData } from '../logging/logger.js';

/**
 * Global error handler — maps AppError subclasses and unexpected errors
 * to the standard Mihnati error envelope.
 * No stack traces, secrets or internal details are exposed.
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (res.locals['requestId'] as string) || 'unknown';

  if (err instanceof AppError) {
    // Operational, expected error
    const envelope: ErrorEnvelope = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details ? (redactSensitiveData(err.details) as Record<string, unknown>) : undefined,
        requestId,
      },
    };

    if (err.statusCode >= 500) {
      logger.error(`AppError [${err.code}]: ${err.message}`, {
        requestId,
        action: 'http:error',
        statusCode: err.statusCode,
        errorCode: err.code,
      });
    } else {
      logger.warn(`AppError [${err.code}]: ${err.message}`, {
        requestId,
        action: 'http:error',
        statusCode: err.statusCode,
        errorCode: err.code,
      });
    }

    res.status(err.statusCode).json(envelope);
    return;
  }

  // Unexpected / programming error — generic 500
  logger.error(`Unhandled error: ${err.message}`, {
    requestId,
    action: 'http:unhandled_error',
    errorName: err.name,
    stack: err.stack,
  });

  const envelope: ErrorEnvelope = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  };

  res.status(500).json(envelope);
}

