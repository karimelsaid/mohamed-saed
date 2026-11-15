import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logging/logger.js';

/**
 * Assigns a unique requestId to each incoming request.
 * Preserves client-sent X-Request-ID if present and valid (UUID format).
 * Sets the requestId on res.locals and the X-Request-ID response header.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientId = req.headers['x-request-id'];
  const requestId =
    typeof clientId === 'string' && /^[0-9a-f-]{36}$/i.test(clientId)
      ? clientId
      : randomUUID();

  res.locals['requestId'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Logs the start and end of each HTTP request with structured JSON.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = (res.locals['requestId'] as string) || 'unknown';

  logger.info(`→ ${req.method} ${req.originalUrl}`, {
    requestId,
    action: 'http:request:start',
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](`← ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`, {
      requestId,
      action: 'http:request:end',
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}

/**
 * Security headers middleware.
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

