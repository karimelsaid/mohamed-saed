/**
 * Mihnati Platform — E20 Analytics, Reporting & Launch Readiness Types
 */

export interface MetricDefinition {
  metricKey: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  formula: string;
  sourceEvents: string[];
  denominatorDefinition?: string;
  freshness: string; // e.g. 'realtime' or 'daily_replay'
  timezone: string; // 'Africa/Cairo' (EET/EEST)
}

export interface KpiSummaryDto {
  period: {
    startDate: string;
    endDate: string;
    timezone: 'Africa/Cairo';
  };
  gmv: {
    totalPiastres: number; // Sum of completed/confirmed merchant orders + accepted service orders
    servicesGmvPiastres: number;
    commerceGmvPiastres: number;
    currency: 'EGP';
  };
  revenue: {
    platformRevenuePiastres: number; // Commissions + Subscriptions
    commissionPiastres: number;
    subscriptionPiastres: number;
    currency: 'EGP';
  };
  volume: {
    totalServiceOrders: number;
    completedServiceOrders: number;
    totalMerchantOrders: number;
    deliveredMerchantOrders: number;
    totalDisputes: number;
  };
  rates: {
    serviceOrderCompletionRatePercent: number; // (completed / total) * 100
    merchantFulfillmentRatePercent: number; // (delivered / total) * 100
    disputeRatePercent: number; // (disputes / total orders) * 100
    codCollectionRatePercent: number; // (collected COD / delivered orders) * 100
  };
  cohorts: {
    totalActiveUsers: number;
    activeProfessionals: number;
    activeMerchants: number;
  };
}

export interface DailyAnalyticsSnapshotDoc {
  _id: string; // snapshot_YYYY-MM-DD
  date: string; // YYYY-MM-DD
  gmvPiastres: number;
  revenuePiastres: number;
  serviceOrdersCount: number;
  merchantOrdersCount: number;
  disputesCount: number;
  activeUsersCount: number;
  rebuiltAt: Date;
  version: number;
}

export type AnalyticsReportType =
  | 'kpi_summary'
  | 'gmv_breakdown'
  | 'category_performance'
  | 'governorate_performance'
  | 'disputes_overview';

export interface AnalyticsExportDoc {
  _id: string; // exp_<uuid>
  requestedBy: string;
  reportType: AnalyticsReportType;
  filter: {
    startDate?: string;
    endDate?: string;
  };
  recordCount: number;
  data: Record<string, unknown>[];
  expiresAt: Date; // AC-E20.3: Expiring export artifact
  createdAt: Date;
}

export interface CreateExportInput {
  reportType: AnalyticsReportType;
  startDate?: string;
  endDate?: string;
}

export interface LaunchGateStatus {
  gate: 'Gate A' | 'Gate B' | 'Gate C' | 'Gate D' | 'Gate E';
  titleAr: string;
  titleEn: string;
  status: 'passed' | 'pending' | 'action_required';
  details: string[];
}

export interface LaunchReadinessDto {
  overallStatus: 'ready' | 'pending_gates' | 'action_required';
  evaluatedAt: string;
  summary: {
    passedGates: number;
    totalGates: number;
    isProductionReady: boolean;
  };
  gates: LaunchGateStatus[];
  systemHealth: {
    database: 'connected' | 'disconnected';
    appliedMigrationsCount: number;
    totalRegisteredMigrations: number;
    seedStatus: {
      governoratesCount: number;
      taxonomiesCount: number;
    };
  };
}

