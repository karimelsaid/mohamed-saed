/**
 * Mihnati Platform — E17 Admin Dashboard, RBAC & Operations Types
 */

export interface AdminUserListItemDto {
  id: string;
  phone: string;
  name: string;
  status: string;
  locale: string;
  activeRoles: string[];
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminUserDetailsDto {
  id: string;
  phone: string;
  name: string;
  status: string;
  locale: string;
  activeRoles: string[];
  roleAssignments: Array<{
    roleKey: string;
    status: string;
    grantedAt: string;
    revokedAt?: string;
    reason?: string;
  }>;
  profiles: {
    professional?: {
      id: string;
      titleAr?: string;
      verificationStatus: string;
      specialtiesCount: number;
    };
    merchant?: {
      id: string;
      verificationStatus: string;
      storesCount: number;
    };
  };
  metrics: {
    activeSessionsCount: number;
    disputesCount: number;
    ordersCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminStaffItemDto {
  userId: string;
  name: string;
  phone: string;
  roleKey: 'admin' | 'support';
  status: string;
  grantedAt: string;
  grantedBy?: string;
  reason?: string;
}

export interface DashboardStatsDto {
  users: {
    total: number;
    active: number;
    suspended: number;
    customers: number;
    professionals: number;
    merchants: number;
    staff: number;
  };
  operations: {
    pendingVerifications: number;
    pendingStoreApprovals: number;
    openDisputes: number;
    openSupportTickets: number;
    pendingCodDisputes: number;
    pendingReviewModerations: number;
  };
  commerce: {
    activeStores: number;
    activeProducts: number;
    activeMerchantOrders: number;
  };
  services: {
    activeServices: number;
    activeServiceOrders: number;
  };
  system: {
    status: 'healthy' | 'degraded';
    serverTime: string;
  };
}

export interface OperationsQueuesDto {
  verifications: Array<{
    id: string;
    userId: string;
    userName?: string;
    profileType: string;
    status: string;
    submittedAt: string;
  }>;
  storeApprovals: Array<{
    id: string;
    storeNameAr: string;
    merchantUserId: string;
    createdAt: string;
  }>;
  disputes: Array<{
    id: string;
    disputeNumber: string;
    subjectType: string;
    status: string;
    initiatorId: string;
    createdAt: string;
  }>;
  codDisputes: Array<{
    id: string;
    orderId: string;
    customerId: string;
    claimedDiscrepancyPiastres: number;
    status: string;
    createdAt: string;
  }>;
  supportTickets: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    priority: string;
    category: string;
    status: string;
    createdAt: string;
  }>;
}

export interface AuditExportDto {
  logs: Array<{
    id: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    requestId?: string;
    createdAt: string;
  }>;
  exportedAt: string;
  exportedBy: string;
  total: number;
}

