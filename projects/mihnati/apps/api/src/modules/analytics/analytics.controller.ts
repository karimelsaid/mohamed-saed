import type { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';

function getRequestId(req: Request, res: Response): string {
  return (
    (res.locals['requestId'] as string) ||
    (req as any).requestId ||
    (req.headers['x-request-id'] as string) ||
    'unknown'
  );
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  getMetricDefinitions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const definitions = this.analyticsService.getMetricDefinitions();
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: definitions,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getKpiSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const startDate = req.query['startDate'] as string;
      const endDate = req.query['endDate'] as string;

      const summary = await this.analyticsService.getKpiSummary({ startDate, endDate });
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: summary,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  rebuildDailyMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const { date } = req.body || {};
      if (!date) {
        throw new ValidationError('Date (YYYY-MM-DD) is required for projection rebuild');
      }

      const snapshot = await this.analyticsService.rebuildDailyMetrics(date);
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: snapshot,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  createExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const requestId = getRequestId(req, res);

      const exportDoc = await this.analyticsService.createExport(
        req.user.id,
        req.body,
        requestId
      );

      res.status(201).json({
        data: exportDoc,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const exportId = getParam(req, 'id');

      const exportDoc = await this.analyticsService.getExportById(req.user.id, exportId);
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: exportDoc,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };

  getLaunchReadiness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const readiness = await this.analyticsService.getLaunchReadinessReport();
      const requestId = getRequestId(req, res);

      res.status(200).json({
        data: readiness,
        meta: { requestId },
      });
    } catch (err) {
      next(err);
    }
  };
}

