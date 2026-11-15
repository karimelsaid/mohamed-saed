import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try loading .env from current directory or monorepo root
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1000).max(65535).default(4203),
  HOST: z.string().default('127.0.0.1'),
  API_PREFIX: z.string().default('/api/v1'),

  // MongoDB 8.0 Native Driver
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('mihnati'),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(1).default(5),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).default(50),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),

  // Security & Sessions
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters long'),
  SESSION_ACCESS_LIFETIME_MINUTES: z.coerce.number().int().min(1).default(15),
  SESSION_REFRESH_LIFETIME_DAYS: z.coerce.number().int().min(1).default(30),
  SESSION_IDLE_EXPIRY_DAYS: z.coerce.number().int().min(1).default(7),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:4200,http://127.0.0.1:4200'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),

  // Integration Drivers
  STORAGE_DRIVER: z.enum(['fake', 's3']).default('fake'),
  OTP_DRIVER: z.enum(['fake', 'live']).default('fake'),
  MAPS_DRIVER: z.enum(['fake', 'live']).default('fake'),
  NOTIFICATION_DRIVER: z.enum(['fake', 'live']).default('fake'),
  PAYMENT_DRIVER: z.enum(['fake', 'live']).default('fake')
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | null = null;

export function loadConfig(envOverrides?: Record<string, string>): AppConfig {
  const envToParse = {
    ...process.env,
    ...envOverrides
  };

  const parsed = configSchema.safeParse(envToParse);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => ` - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');

    throw new Error(`\n[FATAL CONFIGURATION ERROR] Environment validation failed:\n${errorDetails}\n`);
  }

  cachedConfig = parsed.data;
  return parsed.data;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

