import { loadConfig } from '../platform/config/env.js';
import { connectMongo, closeMongo } from '../platform/database/connection.js';
import { runMigrations } from '../platform/database/migrations/index.js';
import { geographyService } from '../modules/geography/geography.service.js';
import { taxonomyService } from '../modules/taxonomy/taxonomy.service.js';
import { createAdapters } from '../platform/adapters/registry.js';
import { createApp } from './app.js';
import { logger } from '../platform/logging/logger.js';
import type { Server } from 'http';

let server: Server | null = null;

async function main(): Promise<void> {
  // 1. Load and validate configuration (fail-fast)
  const config = loadConfig();

  logger.info('Mihnati API starting...', {
    action: 'bootstrap:start',
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
  });

  // 2. Connect to MongoDB
  try {
    await connectMongo(config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to connect to MongoDB: ${msg}`, {
      action: 'bootstrap:mongo_fail',
    });
    logger.warn(
      'Server will start without MongoDB. Readiness check will report fail.',
      { action: 'bootstrap:mongo_skip' }
    );
  }

  // 3. Run migrations and seed baseline data (only if Mongo connected)
  try {
    await runMigrations();
    await geographyService.seedIfEmpty();
    await taxonomyService.seedIfEmpty();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Migration/seeding skipped or failed: ${msg}`, {
      action: 'bootstrap:migration_skip',
    });
  }

  // 4. Initialize integration adapters (all fake in E01)
  const adapters = createAdapters(config);
  logger.info('Adapters initialized', {
    action: 'bootstrap:adapters',
    storage: config.STORAGE_DRIVER,
    otp: config.OTP_DRIVER,
  });

  // Make adapters available (store on app or a context — for now log them)
  void adapters;

  // 5. Create Express application
  const app = createApp(config);

  // 6. Start HTTP server
  server = app.listen(config.PORT, config.HOST, () => {
    logger.info(`Mihnati API listening on http://${config.HOST}:${config.PORT}`, {
      action: 'bootstrap:ready',
      host: config.HOST,
      port: config.PORT,
      apiPrefix: config.API_PREFIX,
    });
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`, {
      action: 'bootstrap:shutdown',
      signal,
    });

    if (server) {
      server.close(() => {
        logger.info('HTTP server closed', { action: 'bootstrap:server_closed' });
      });
    }

    await closeMongo();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', {
      action: 'process:unhandled_rejection',
      reason: String(reason),
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, {
      action: 'process:uncaught_exception',
      errorName: err.name,
      stack: err.stack,
    });
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[FATAL] Bootstrap failed: ${msg}`);
  process.exit(1);
});

export { server };

