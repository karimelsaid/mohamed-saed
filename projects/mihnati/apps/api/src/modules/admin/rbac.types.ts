export const PERMISSIONS = {
  USERS_READ: 'admin:users:read',
  USERS_WRITE: 'admin:users:write',
  USERS_SUSPEND: 'admin:users:suspend',
  ROLES_GRANT: 'admin:roles:grant',
  ROLES_REVOKE: 'admin:roles:revoke',
  VERIFICATION_REVIEW: 'admin:verification:review',
  CATEGORIES_MANAGE: 'admin:categories:manage',
  SERVICES_MODERATE: 'admin:services:moderate',
  STORES_MODERATE: 'admin:stores:moderate',
  PRODUCTS_MODERATE: 'admin:products:moderate',
  AUDIT_READ: 'admin:audit:read',
  AUDIT_EXPORT: 'admin:audit:export',
  SUPPORT_MANAGE: 'admin:support:manage',
  DISPUTES_MANAGE: 'admin:disputes:manage',
  REVIEWS_MODERATE: 'admin:reviews:moderate',
  DASHBOARD_READ: 'admin:dashboard:read',
  STAFF_MANAGE: 'admin:staff:manage',
  FINANCE_READ: 'admin:finance:read',
  COMMISSIONS_MANAGE: 'admin:commissions:manage',
  SUBSCRIPTIONS_MANAGE: 'admin:subscriptions:manage',
  CAMPAIGNS_READ: 'admin:campaigns:read',
  CAMPAIGNS_MODERATE: 'admin:campaigns:moderate',
  ANALYTICS_READ: 'admin:analytics:read',
  ANALYTICS_EXPORT: 'admin:analytics:export',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS_MAP: Record<string, PermissionKey[]> = {
  admin: Object.values(PERMISSIONS),
  support: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.SUPPORT_MANAGE,
    PERMISSIONS.DISPUTES_MANAGE,
    PERMISSIONS.REVIEWS_MODERATE,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.ANALYTICS_READ,
  ],
  customer: [],
  professional: [],
  merchant: [],
};

export interface AdminAuditLogDoc {
  _id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  sensitivePurpose?: string;
  requestId?: string;
  createdAt: Date;
}
