import { Router } from 'express';
import type { Request, Response } from 'express';
import type { HealthResponse, ReadyResponse } from '@mihnati/contracts';
import { isMongoHealthy } from '../database/connection.js';
import { getConfig } from '../config/env.js';

const startTime = Date.now();

export function createHealthRouter(): Router {
  const router = Router();

  /**
   * GET /health — Liveness check.
   * Always returns 200 if the process is alive.
   */
  router.get('/health', (_req: Request, res: Response) => {
    const requestId = (res.locals['requestId'] as string) || 'unknown';
    const uptimeSeconds = (Date.now() - startTime) / 1000;

    const response: HealthResponse = {
      data: {
        status: 'pass',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
      },
      meta: { requestId },
    };

    res.status(200).json(response);
  });

  /**
   * GET /ready — Readiness check.
   * Returns 200 if MongoDB and required config are ready, otherwise 503.
   */
  router.get('/ready', async (_req: Request, res: Response) => {
    const requestId = (res.locals['requestId'] as string) || 'unknown';

    // Check MongoDB
    const mongoCheck = await isMongoHealthy();

    // Check configuration
    let configOk = false;
    let configMessage = '';
    try {
      const cfg = getConfig();
      if (cfg.MONGODB_URI && cfg.SESSION_SECRET) {
        configOk = true;
        configMessage = 'All required config values present';
      } else {
        configMessage = 'Missing required configuration values';
      }
    } catch (err: unknown) {
      configMessage = err instanceof Error ? err.message : 'Config validation failed';
    }

    const allPass = mongoCheck.healthy && configOk;

    const response: ReadyResponse = {
      data: {
        status: allPass ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        checks: {
          mongodb: {
            status: mongoCheck.healthy ? 'pass' : 'fail',
            message: mongoCheck.message,
          },
          configuration: {
            status: configOk ? 'pass' : 'fail',
            message: configMessage,
          },
        },
      },
      meta: { requestId },
    };

    res.status(allPass ? 200 : 503).json(response);
  });

  return router;
}

