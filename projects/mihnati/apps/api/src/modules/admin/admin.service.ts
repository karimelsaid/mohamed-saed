import { getDb } from '../../platform/database/connection.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../platform/http/errors.js';
import { AuditService } from './audit.service.js';
import { UserDoc } from '../identity/auth.types.js';
import {
  RoleAssignmentDoc,
  RoleKey,
  RoleAssignmentStatus,
  ProfessionalProfileDoc,
  MerchantProfileDoc,
} from '../roles/role.types.js';
import { StoreDoc } from '../stores/stores.types.js';
import { VerificationCaseDoc } from '../verification/verification.types.js';
import { DisputeDoc } from '../disputes/disputes.types.js';
import { SupportTicketDoc } from '../disputes/disputes.types.js';
import { CodDisputeDoc } from '../cod/cod.types.js';
import {
  AdminUserListItemDto,
  AdminUserDetailsDto,
  AdminStaffItemDto,
  DashboardStatsDto,
  OperationsQueuesDto,
  AuditExportDto,
} from './admin.types.js';
import { randomUUID } from 'crypto';

export class AdminService {
  constructor(private readonly auditService: AuditService) {}

  private getUsersCol() {
    return getDb().collection<UserDoc>('users');
  }

  private getRoleAssignmentsCol() {
    return getDb().collection<RoleAssignmentDoc>('user_role_assignments');
  }

  private getProfessionalProfilesCol() {
    return getDb().collection<ProfessionalProfileDoc>('professional_profiles');
  }

  private getMerchantProfilesCol() {
    return getDb().collection<MerchantProfileDoc>('merchant_profiles');
  }

  private getStoresCol() {
    return getDb().collection<StoreDoc>('stores');
  }

  private getVerificationCasesCol() {
    return getDb().collection<VerificationCaseDoc>('verification_cases');
  }

  private getDisputesCol() {
    return getDb().collection<DisputeDoc>('disputes');
  }

  private getSupportTicketsCol() {
    return getDb().collection<SupportTicketDoc>('support_tickets');
  }

  private getCodDisputesCol() {
    return getDb().collection<CodDisputeDoc>('cod_disputes');
  }

  // ══════════════════════════════════════════════════════════════
  // ── 1. User Management (E17-T02) ──
  // ══════════════════════════════════════════════════════════════

  async listUsers(query: {
    search?: string;
    status?: string;
    role?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: AdminUserListItemDto[]; total: number }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter['status'] = query.status;
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter['$or'] = [{ name: searchRegex }, { phone: searchRegex }];
    }

    if (query.role) {
      const userIdsWithRole = await this.getRoleAssignmentsCol()
        .find({ roleKey: query.role as RoleKey, status: 'active' as RoleAssignmentStatus })
        .project({ userId: 1 })
        .toArray();
      filter['_id'] = { $in: userIdsWithRole.map((r) => r.userId) };
    }

    const [userDocs, total] = await Promise.all([
      this.getUsersCol()
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .toArray(),
      this.getUsersCol().countDocuments(filter),
    ]);

    const userIds = userDocs.map((u) => u._id);
    const roleAssignments = await this.getRoleAssignmentsCol()
      .find({ userId: { $in: userIds }, status: 'active' as RoleAssignmentStatus })
      .toArray();

    const rolesByUserMap: Record<string, string[]> = {};
    for (const assignment of roleAssignments) {
      if (!rolesByUserMap[assignment.userId]) {
        rolesByUserMap[assignment.userId] = [];
      }
      rolesByUserMap[assignment.userId].push(assignment.roleKey);
    }

    const users: AdminUserListItemDto[] = userDocs.map((u) => ({
      id: u._id,
      phone: u.phone,
      name: u.name,
      status: u.status,
      locale: u.locale,
      activeRoles: rolesByUserMap[u._id] || ['customer'],
      createdAt: u.createdAt.toISOString(),
    }));

    return { users, total };
  }

  async getUserDetails(targetUserId: string): Promise<AdminUserDetailsDto> {
    const user = await this.getUsersCol().findOne({ _id: targetUserId });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const [
      roleAssignments,
      proProfile,
      merchProfile,
      storesCount,
      activeSessionsCount,
      disputesCount,
      serviceOrdersCount,
      merchantOrdersCount,
    ] = await Promise.all([
      this.getRoleAssignmentsCol().find({ userId: targetUserId }).sort({ createdAt: -1 }).toArray(),
      this.getProfessionalProfilesCol().findOne({ userId: targetUserId }),
      this.getMerchantProfilesCol().findOne({ userId: targetUserId }),
      this.getStoresCol().countDocuments({ merchantUserId: targetUserId }),
      getDb().collection('sessions').countDocuments({ userId: targetUserId }),
      this.getDisputesCol().countDocuments({
        $or: [{ initiatorId: targetUserId }, { respondentId: targetUserId }],
      }),
      getDb().collection('service_orders').countDocuments({
        $or: [{ customerId: targetUserId }, { professionalUserId: targetUserId }],
      }),
      getDb().collection('merchant_orders').countDocuments({
        $or: [{ customerId: targetUserId }, { merchantUserId: targetUserId }],
      }),
    ]);

    const activeRoles = roleAssignments
      .filter((r: RoleAssignmentDoc) => r.status === 'active')
      .map((r: RoleAssignmentDoc) => r.roleKey);

    return {
      id: user._id,
      phone: user.phone,
      name: user.name,
      status: user.status,
      locale: user.locale,
      activeRoles: activeRoles.length > 0 ? activeRoles : ['customer'],
      roleAssignments: roleAssignments.map((r: RoleAssignmentDoc) => ({
        roleKey: r.roleKey,
        status: r.status,
        grantedAt: r.grantedAt.toISOString(),
        revokedAt: r.revokedAt?.toISOString(),
        reason: r.reason,
      })),
      profiles: {
        professional: proProfile
          ? {
              id: proProfile._id,
              titleAr: proProfile.title,
              verificationStatus: proProfile.verificationStatus,
              specialtiesCount: proProfile.specialties?.length || 0,
            }
          : undefined,
        merchant: merchProfile
          ? {
              id: merchProfile._id,
              verificationStatus: merchProfile.verificationStatus,
              storesCount,
            }
          : undefined,
      },
      metrics: {
        activeSessionsCount,
        disputesCount,
        ordersCount: serviceOrdersCount + merchantOrdersCount,
      },
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async unsuspendUser(
    actorId: string,
    targetUserId: string,
    reason: string,
    requestId?: string
  ): Promise<{ status: string }> {
    if (actorId === targetUserId) {
      throw new ForbiddenError('Administrators cannot modify the suspension state of their own account.');
    }

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('A detailed reason is required to unsuspend an account');
    }

    const user = await this.getUsersCol().findOne({ _id: targetUserId });
    if (!user) {
      throw new NotFoundError('Target user not found');
    }

    if (user.status !== 'suspended') {
      throw new ValidationError(`User is not in suspended state (current: ${user.status})`);
    }

    const now = new Date();
    await this.getUsersCol().updateOne(
      { _id: targetUserId },
      {
        $set: { status: 'active', updatedAt: now },
        $inc: { version: 1 },
      }
    );

    await this.auditService.log({
      actorId,
      action: 'admin:users:unsuspend',
      targetType: 'UserAccount',
      targetId: targetUserId,
      reason: reason.trim(),
      requestId,
    });

    return { status: 'active' };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 2. Staff Management (E17-T02) ──
  // ══════════════════════════════════════════════════════════════

  async listStaff(query: { page?: number; pageSize?: number }): Promise<{ staff: AdminStaffItemDto[]; total: number }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const filter: Record<string, unknown> = {
      roleKey: { $in: ['admin', 'support'] },
      status: 'active',
    };

    const [assignments, total] = await Promise.all([
      this.getRoleAssignmentsCol().find(filter as any).sort({ grantedAt: -1 }).skip(skip).limit(pageSize).toArray(),
      this.getRoleAssignmentsCol().countDocuments(filter as any),
    ]);

    const userIds = assignments.map((a) => a.userId);
    const users = await this.getUsersCol()
      .find({ _id: { $in: userIds } })
      .project({ _id: 1, name: 1, phone: 1, status: 1 })
      .toArray();

    const userMap = new Map(users.map((u) => [u._id, u]));

    const staff: AdminStaffItemDto[] = assignments.map((a) => {
      const u = userMap.get(a.userId);
      return {
        userId: a.userId,
        name: u?.name || 'مستخدم غير معروف',
        phone: u?.phone || '',
        roleKey: a.roleKey as 'admin' | 'support',
        status: u?.status || 'unknown',
        grantedAt: a.grantedAt.toISOString(),
        grantedBy: a.grantedBy,
        reason: a.reason,
      };
    });

    return { staff, total };
  }

  async assignStaff(
    actorId: string,
    input: { targetUserId: string; roleKey: 'admin' | 'support'; reason: string },
    requestId?: string
  ): Promise<AdminStaffItemDto> {
    if (!input.targetUserId || !input.roleKey || !input.reason) {
      throw new ValidationError('targetUserId, roleKey, and reason are required');
    }

    if (!['admin', 'support'].includes(input.roleKey)) {
      throw new ValidationError('Role must be either admin or support');
    }

    const user = await this.getUsersCol().findOne({ _id: input.targetUserId });
    if (!user) {
      throw new NotFoundError('Target user not found');
    }

    const now = new Date();
    await this.getRoleAssignmentsCol().updateOne(
      { userId: input.targetUserId, roleKey: input.roleKey },
      {
        $set: {
          status: 'active',
          grantedBy: actorId,
          grantedAt: now,
          reason: input.reason.trim(),
          updatedAt: now,
        },
        $setOnInsert: {
          _id: `ura_${randomUUID()}`,
          userId: input.targetUserId,
          roleKey: input.roleKey,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    await this.auditService.log({
      actorId,
      action: 'admin:staff:assigned',
      targetType: 'UserRoleAssignment',
      targetId: input.targetUserId,
      reason: input.reason.trim(),
      metadata: { roleKey: input.roleKey },
      requestId,
    });

    return {
      userId: user._id,
      name: user.name,
      phone: user.phone,
      roleKey: input.roleKey,
      status: user.status,
      grantedAt: now.toISOString(),
      grantedBy: actorId,
      reason: input.reason.trim(),
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 3. Operational Dashboard & Queues (E17-T03) ──
  // ══════════════════════════════════════════════════════════════

  async getDashboardStats(): Promise<DashboardStatsDto> {
    const db = getDb();

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      customersCount,
      professionalsCount,
      merchantsCount,
      staffCount,
      pendingVerifications,
      pendingStoreApprovals,
      openDisputes,
      openSupportTickets,
      pendingCodDisputes,
      pendingReviewModerations,
      activeStores,
      activeProducts,
      activeMerchantOrders,
      activeServices,
      activeServiceOrders,
    ] = await Promise.all([
      this.getUsersCol().countDocuments({}),
      this.getUsersCol().countDocuments({ status: 'active' }),
      this.getUsersCol().countDocuments({ status: 'suspended' }),
      this.getRoleAssignmentsCol().countDocuments({ roleKey: 'customer', status: 'active' }),
      this.getRoleAssignmentsCol().countDocuments({ roleKey: 'professional', status: 'active' }),
      this.getRoleAssignmentsCol().countDocuments({ roleKey: 'merchant', status: 'active' }),
      this.getRoleAssignmentsCol().countDocuments({ roleKey: { $in: ['admin', 'support'] }, status: 'active' }),
      this.getVerificationCasesCol().countDocuments({ status: 'pending_review' }),
      this.getStoresCol().countDocuments({ status: 'pending_approval' }),
      this.getDisputesCol().countDocuments({ status: { $in: ['open', 'under_review', 'awaiting_evidence', 'appeal_requested'] } }),
      this.getSupportTicketsCol().countDocuments({ status: { $in: ['open', 'in_progress', 'waiting_user'] } }),
      this.getCodDisputesCol().countDocuments({ status: { $in: ['open', 'under_review'] } }),
      db.collection('reviews').countDocuments({ status: 'hidden_pending_review' }),
      this.getStoresCol().countDocuments({ status: 'active' }),
      db.collection('products').countDocuments({ status: 'active' }),
      db.collection('merchant_orders').countDocuments({ status: { $nin: ['completed', 'cancelled'] } }),
      db.collection('services').countDocuments({ status: 'active' }),
      db.collection('service_orders').countDocuments({ status: { $nin: ['completed', 'cancelled'] } }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        customers: customersCount,
        professionals: professionalsCount,
        merchants: merchantsCount,
        staff: staffCount,
      },
      operations: {
        pendingVerifications,
        pendingStoreApprovals,
        openDisputes,
        openSupportTickets,
        pendingCodDisputes,
        pendingReviewModerations,
      },
      commerce: {
        activeStores,
        activeProducts,
        activeMerchantOrders,
      },
      services: {
        activeServices,
        activeServiceOrders,
      },
      system: {
        status: 'healthy',
        serverTime: new Date().toISOString(),
      },
    };
  }

  async getOperationsQueues(): Promise<OperationsQueuesDto> {
    const [
      verificationsDocs,
      storeDocs,
      disputeDocs,
      codDocs,
      ticketDocs,
    ] = await Promise.all([
      this.getVerificationCasesCol()
        .find({ status: 'pending_review' })
        .sort({ createdAt: 1 })
        .limit(10)
        .toArray(),
      this.getStoresCol()
        .find({ status: 'pending_approval' })
        .sort({ createdAt: 1 })
        .limit(10)
        .toArray(),
      this.getDisputesCol()
        .find({ status: { $in: ['open', 'under_review', 'appeal_requested'] } })
        .sort({ createdAt: 1 })
        .limit(10)
        .toArray(),
      this.getCodDisputesCol()
        .find({ status: { $in: ['open', 'under_review'] } })
        .sort({ createdAt: 1 })
        .limit(10)
        .toArray(),
      this.getSupportTicketsCol()
        .find({ status: { $in: ['open', 'in_progress'] } })
        .sort({ priority: -1, createdAt: 1 })
        .limit(10)
        .toArray(),
    ]);

    return {
      verifications: verificationsDocs.map((v) => ({
        id: v._id,
        userId: v.userId,
        profileType: v.profileType,
        status: v.status,
        submittedAt: v.createdAt.toISOString(),
      })),
      storeApprovals: storeDocs.map((s) => ({
        id: s._id,
        storeNameAr: s.nameAr,
        merchantUserId: s.merchantUserId,
        createdAt: s.createdAt.toISOString(),
      })),
      disputes: disputeDocs.map((d) => ({
        id: d._id,
        disputeNumber: d.disputeNumber,
        subjectType: d.subjectType,
        status: d.status,
        initiatorId: d.initiatorId,
        createdAt: d.createdAt.toISOString(),
      })),
      codDisputes: codDocs.map((c) => ({
        id: c._id,
        orderId: c.orderId,
        customerId: c.customerId,
        claimedDiscrepancyPiastres: c.customerClaimedAmountPiastres || 0,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
      supportTickets: ticketDocs.map((t) => ({
        id: t._id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        priority: t.priority,
        category: t.category,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 4. Audit Log Export (E17-T03) ──
  // ══════════════════════════════════════════════════════════════

  async exportAuditLogs(
    actorId: string,
    filter: {
      startDate?: string;
      endDate?: string;
      actorId?: string;
      targetType?: string;
    },
    requestId?: string
  ): Promise<AuditExportDto> {
    const query: Record<string, unknown> = {};

    if (filter.actorId) query['actorId'] = filter.actorId;
    if (filter.targetType) query['targetType'] = filter.targetType;

    if (filter.startDate || filter.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filter.startDate) dateFilter['$gte'] = new Date(filter.startDate);
      if (filter.endDate) dateFilter['$lte'] = new Date(filter.endDate);
      query['createdAt'] = dateFilter;
    }

    const logs = await getDb()
      .collection('admin_audit_logs')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray();

    const now = new Date();

    // Log the sensitive export event
    await this.auditService.log({
      actorId,
      action: 'admin:audit_logs:exported',
      targetType: 'AdminAuditLogs',
      targetId: 'export',
      reason: 'Compliance and internal operational audit export',
      metadata: { count: logs.length, filter },
      requestId,
    });

    return {
      logs: logs.map((l: any) => ({
        id: l._id,
        actorId: l.actorId,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        reason: l.reason,
        metadata: l.metadata,
        requestId: l.requestId,
        createdAt: l.createdAt.toISOString(),
      })),
      exportedAt: now.toISOString(),
      exportedBy: actorId,
      total: logs.length,
    };
  }
}
