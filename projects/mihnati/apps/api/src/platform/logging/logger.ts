import { getConfig } from '../config/env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'otp',
  'code',
  'secret',
  'sessionsecret',
  'authorization',
  'cookie',
  'set-cookie',
  'nationalid',
  'identitydocument',
  'creditcard',
  'cardnumber',
  'cvv',
  'coordinates',
  'fulladdress',
  'latitude',
  'longitude'
]);

export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = redactSensitiveData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  action?: string;
  [key: string]: unknown;
}

export class Logger {
  private minLevel: LogLevel = 'info';

  constructor() {
    try {
      const cfg = getConfig();
      this.minLevel = cfg.LOG_LEVEL;
    } catch {
      this.minLevel = 'info';
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  private output(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...(context ? (redactSensitiveData(context) as Record<string, unknown>) : {})
    };

    const serialized = JSON.stringify(payload);
    if (level === 'error') {
      process.stderr.write(serialized + '\n');
    } else {
      process.stdout.write(serialized + '\n');
    }
  }

  debug(message: string, context?: LogContext): void {
    this.output('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.output('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.output('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.output('error', message, context);
  }
}

export const logger = new Logger();

