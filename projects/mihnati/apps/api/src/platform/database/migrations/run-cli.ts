/**
 * CLI runner for database migrations.
 * Usage: tsx src/platform/database/migrations/run-cli.ts
 */
import { loadConfig } from '../../config/env.js';
import { connectMongo, closeMongo } from '../connection.js';
import { runMigrations } from './index.js';
import { logger } from '../../logging/logger.js';

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    await connectMongo(config);
    await runMigrations();
    logger.info('All migrations completed successfully', { action: 'migration:cli:done' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Migration CLI failed: ${msg}`, { action: 'migration:cli:error' });
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
}

main();

