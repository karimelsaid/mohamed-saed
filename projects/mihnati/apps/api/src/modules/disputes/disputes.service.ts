import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import { ServiceOrderDoc } from '../orders/orders.types.js';
import { MerchantOrderDoc } from '../commerce/commerce.types.js';
import { RoleAssignmentDoc } from '../roles/role.types.js';
import {
  SupportTicketDoc,
  SupportTicketDto,
  SupportMessageDoc,
  SupportMessageDto,
  CreateSupportTicketInput,
  CreateSupportMessageInput,
  SupportTicketStatus,
  ReportDoc,
  ReportDto,
  CreateReportInput,
  ResolveReportInput,
  DisputeDoc,
  DisputeDto,
  CreateDisputeInput,
  SubmitEvidenceInput,
  RequestEvidenceInput,
  IssueDecisionInput,
  AppealDisputeInput,
  AppealDecisionInput,
  ReturnRequestDoc,
  ReturnRequestDto,
  CreateReturnRequestInput,
  ReviewReturnInput,
  InspectReturnInput,
  ResolveReturnInput,
} from './disputes.types.js';

export class DisputesService {
  constructor(private auditService: AuditService) {}

  private getSupportTicketsCollection() {
    return getDb().collection<SupportTicketDoc>('support_tickets');
  }

  private getSupportMessagesCollection() {
    return getDb().collection<SupportMessageDoc>('support_messages');
  }

  private getReportsCollection() {
    return getDb().collection<ReportDoc>('reports');
  }

  private getDisputesCollection() {
    return getDb().collection<DisputeDoc>('disputes');
  }

  private getReturnRequestsCollection() {
    return getDb().collection<ReturnRequestDoc>('return_requests');
  }

  private getServiceOrdersCollection() {
    return getDb().collection<ServiceOrderDoc>('service_orders');
  }

  private getMerchantOrdersCollection() {
    return getDb().collection<MerchantOrderDoc>('merchant_orders');
  }

  private getUserRolesCollection() {
    return getDb().collection<RoleAssignmentDoc>('user_role_assignments');
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const assignments = await this.getUserRolesCollection()
      .find({ userId, status: 'active' })
      .toArray();
    return assignments.map((a) => a.roleKey);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Support Tickets & Messages ──
  // ══════════════════════════════════════════════════════════════

  async createSupportTicket(
    userId: string,
    userRole: string,
    input: CreateSupportTicketInput,
    requestId?: string
  ): Promise<SupportTicketDto> {
    if (!input.subject || input.subject.trim().length === 0) {
      throw new ValidationError('Subject is required');
    }
    if (!input.message || input.message.trim().length === 0) {
      throw new ValidationError('Message is required');
    }

    const ticketId = randomUUID();
    const ticketNumber = `TCK-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    const ticketDoc: SupportTicketDoc = {
      _id: ticketId,
      ticketNumber,
      userId,
      userRole,
      subject: input.subject.trim(),
      category: input.category || 'other',
      priority: input.priority || 'medium',
      status: 'open',
      relatedOrderId: input.relatedOrderId,
      relatedOrderType: input.relatedOrderType,
      createdAt: now,
      updatedAt: now,
    };

    await this.getSupportTicketsCollection().insertOne(ticketDoc);

    const messageDoc: SupportMessageDoc = {
      _id: randomUUID(),
      ticketId,
      senderId: userId,
      senderRole: 'user',
      message: input.message.trim(),
      attachments: input.attachments || [],
      createdAt: now,
    };

    await this.getSupportMessagesCollection().insertOne(messageDoc);

    await this.auditService.log({
      actorId: userId,
      action: 'support_ticket:created',
      targetType: 'support_ticket',
      targetId: ticketId,
      requestId,
      metadata: { ticketNumber, category: ticketDoc.category },
    });

    return this.mapTicketToDto(ticketDoc);
  }

  async getUserSupportTickets(userId: string): Promise<SupportTicketDto[]> {
    const tickets = await this.getSupportTicketsCollection()
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return tickets.map((t) => this.mapTicketToDto(t));
  }

  async getSupportTicketById(
    userId: string,
    userRoles: string[],
    ticketId: string
  ): Promise<SupportTicketDto> {
    const ticket = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    if (!ticket) {
      throw new NotFoundError('Support ticket not found');
    }

    const isStaff = userRoles.includes('admin') || userRoles.includes('support');
    if (ticket.userId !== userId && !isStaff) {
      throw new ForbiddenError('You are not authorized to access this support ticket');
    }

    return this.mapTicketToDto(ticket);
  }

  async createSupportMessage(
    userId: string,
    userRoles: string[],
    ticketId: string,
    input: CreateSupportMessageInput,
    requestId?: string
  ): Promise<SupportMessageDto> {
    const ticket = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    if (!ticket) {
      throw new NotFoundError('Support ticket not found');
    }

    const isStaff = userRoles.includes('admin') || userRoles.includes('support');
    if (ticket.userId !== userId && !isStaff) {
      throw new ForbiddenError('You are not authorized to respond to this ticket');
    }

    if (!input.message || input.message.trim().length === 0) {
      throw new ValidationError('Message content is required');
    }

    const now = new Date();
    const senderRole = isStaff ? 'staff' : 'user';

    const messageDoc: SupportMessageDoc = {
      _id: randomUUID(),
      ticketId,
      senderId: userId,
      senderRole,
      message: input.message.trim(),
      attachments: input.attachments || [],
      createdAt: now,
    };

    await this.getSupportMessagesCollection().insertOne(messageDoc);

    // Auto-update ticket status based on response source
    const newStatus: SupportTicketStatus = isStaff ? 'waiting_user' : 'in_progress';
    await this.getSupportTicketsCollection().updateOne(
      { _id: ticketId },
      {
        $set: {
          status: ticket.status === 'closed' ? ticket.status : newStatus,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: userId,
      action: 'support_message:created',
      targetType: 'support_ticket',
      targetId: ticketId,
      requestId,
      metadata: { senderRole },
    });

    return this.mapMessageToDto(messageDoc);
  }

  async getSupportMessages(
    userId: string,
    userRoles: string[],
    ticketId: string
  ): Promise<SupportMessageDto[]> {
    const ticket = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    if (!ticket) {
      throw new NotFoundError('Support ticket not found');
    }

    const isStaff = userRoles.includes('admin') || userRoles.includes('support');
    if (ticket.userId !== userId && !isStaff) {
      throw new ForbiddenError('You are not authorized to view messages for this ticket');
    }

    const messages = await this.getSupportMessagesCollection()
      .find({ ticketId })
      .sort({ createdAt: 1 })
      .toArray();

    return messages.map((m) => this.mapMessageToDto(m));
  }

  async adminListSupportTickets(query: {
    status?: SupportTicketStatus;
    category?: string;
    priority?: string;
    assignedStaffId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ tickets: SupportTicketDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.priority) filter.priority = query.priority;
    if (query.assignedStaffId) filter.assignedStaffId = query.assignedStaffId;

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const total = await this.getSupportTicketsCollection().countDocuments(filter);
    const docs = await this.getSupportTicketsCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      tickets: docs.map((d) => this.mapTicketToDto(d)),
      total,
    };
  }

  async adminAssignTicket(
    staffId: string,
    ticketId: string,
    assignedStaffId: string,
    requestId?: string
  ): Promise<SupportTicketDto> {
    const ticket = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    if (!ticket) {
      throw new NotFoundError('Support ticket not found');
    }

    const now = new Date();
    const updateFields: Partial<SupportTicketDoc> = {
      assignedStaffId,
      updatedAt: now,
    };

    if (ticket.status === 'open') {
      updateFields.status = 'in_progress';
    }

    await this.getSupportTicketsCollection().updateOne(
      { _id: ticketId },
      { $set: updateFields }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'support_ticket:assigned',
      targetType: 'support_ticket',
      targetId: ticketId,
      requestId,
      metadata: { assignedStaffId },
    });

    const updated = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    return this.mapTicketToDto(updated!);
  }

  async adminUpdateTicketStatus(
    staffId: string,
    ticketId: string,
    status: SupportTicketStatus,
    requestId?: string
  ): Promise<SupportTicketDto> {
    const ticket = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    if (!ticket) {
      throw new NotFoundError('Support ticket not found');
    }

    const now = new Date();
    const updateFields: Record<string, unknown> = {
      status,
      updatedAt: now,
    };

    if (status === 'closed' || status === 'resolved') {
      updateFields.closedAt = now;
    }

    await this.getSupportTicketsCollection().updateOne(
      { _id: ticketId },
      { $set: updateFields }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'support_ticket:status_updated',
      targetType: 'support_ticket',
      targetId: ticketId,
      requestId,
      metadata: { previousStatus: ticket.status, newStatus: status },
    });

    const updated = await this.getSupportTicketsCollection().findOne({ _id: ticketId });
    return this.mapTicketToDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Reports (Content, Users, Reviews) ──
  // ══════════════════════════════════════════════════════════════

  async createReport(
    reporterId: string,
    input: CreateReportInput,
    requestId?: string
  ): Promise<ReportDto> {
    if (!input.targetType || !input.targetId) {
      throw new ValidationError('targetType and targetId are required');
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('Reason is required');
    }

    const reportId = randomUUID();
    const now = new Date();

    const reportDoc: ReportDoc = {
      _id: reportId,
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason.trim(),
      details: input.details?.trim(),
      evidenceUrls: input.evidenceUrls || [],
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await this.getReportsCollection().insertOne(reportDoc);

    await this.auditService.log({
      actorId: reporterId,
      action: 'report:submitted',
      targetType: 'report',
      targetId: reportId,
      requestId,
      metadata: { targetType: input.targetType, targetId: input.targetId },
    });

    return this.mapReportToDto(reportDoc);
  }

  async adminListReports(query: {
    status?: string;
    targetType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ reports: ReportDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.targetType) filter.targetType = query.targetType;

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const total = await this.getReportsCollection().countDocuments(filter);
    const docs = await this.getReportsCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      reports: docs.map((d) => this.mapReportToDto(d)),
      total,
    };
  }

  async adminResolveReport(
    staffId: string,
    reportId: string,
    input: ResolveReportInput,
    requestId?: string
  ): Promise<ReportDto> {
    const report = await this.getReportsCollection().findOne({ _id: reportId });
    if (!report) {
      throw new NotFoundError('Report not found');
    }

    if (!input.resolutionReason || input.resolutionReason.trim().length === 0) {
      throw new ValidationError('Resolution reason is required');
    }

    const now = new Date();
    await this.getReportsCollection().updateOne(
      { _id: reportId },
      {
        $set: {
          status: input.status,
          resolutionReason: input.resolutionReason.trim(),
          actionTaken: input.actionTaken?.trim(),
          assignedStaffId: staffId,
          resolvedAt: now,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'report:resolved',
      targetType: 'report',
      targetId: reportId,
      requestId,
      metadata: { status: input.status, actionTaken: input.actionTaken },
    });

    const updated = await this.getReportsCollection().findOne({ _id: reportId });
    return this.mapReportToDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Formal Order Disputes ──
  // ══════════════════════════════════════════════════════════════

  async createDispute(
    userId: string,
    input: CreateDisputeInput,
    requestId?: string
  ): Promise<DisputeDto> {
    if (!input.subjectType || !input.subjectId) {
      throw new ValidationError('subjectType and subjectId are required');
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('Dispute reason is required');
    }

    let customerId: string;
    let respondentId: string;

    if (input.subjectType === 'service_order') {
      const order = await this.getServiceOrdersCollection().findOne({ _id: input.subjectId });
      if (!order) {
        throw new NotFoundError('Service order not found');
      }
      customerId = order.customerId;
      respondentId = order.professionalUserId;

      if (userId !== customerId && userId !== respondentId) {
        throw new ForbiddenError('Only order participants can open a dispute');
      }
    } else if (input.subjectType === 'merchant_order') {
      const order = await this.getMerchantOrdersCollection().findOne({ _id: input.subjectId });
      if (!order) {
        throw new NotFoundError('Merchant order not found');
      }
      customerId = order.customerId;
      respondentId = order.merchantUserId;

      if (userId !== customerId && userId !== respondentId) {
        throw new ForbiddenError('Only order participants can open a dispute');
      }
    } else {
      throw new ValidationError('Unsupported subjectType for dispute');
    }

    // Guard: Duplicate active dispute prevention
    const existingActive = await this.getDisputesCollection().findOne({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      status: { $nin: ['resolved', 'dismissed'] },
    });

    if (existingActive) {
      throw new ConflictError(
        'An active dispute already exists for this order',
        'DUPLICATE_DISPUTE'
      );
    }

    const disputeId = randomUUID();
    const disputeNumber = `DSP-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    const evidenceList: DisputeDoc['evidenceList'] = [];
    if (input.initialEvidenceDescription) {
      evidenceList.push({
        id: randomUUID(),
        submittedBy: userId,
        role: 'initiator',
        description: input.initialEvidenceDescription.trim(),
        attachmentUrls: input.initialAttachmentUrls || [],
        submittedAt: now,
      });
    }

    const disputeDoc: DisputeDoc = {
      _id: disputeId,
      disputeNumber,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      initiatorId: userId,
      respondentId: userId === customerId ? respondentId : customerId,
      reason: input.reason.trim(),
      status: 'open',
      evidenceList,
      createdAt: now,
      updatedAt: now,
    };

    await this.getDisputesCollection().insertOne(disputeDoc);

    // Transition owning order status to 'disputed' if permitted
    if (input.subjectType === 'service_order') {
      await this.getServiceOrdersCollection().updateOne(
        { _id: input.subjectId, status: { $nin: ['cancelled', 'completed'] } },
        { $set: { status: 'disputed', disputeReason: input.reason.trim(), updatedAt: now } }
      );
    } else if (input.subjectType === 'merchant_order') {
      await this.getMerchantOrdersCollection().updateOne(
        { _id: input.subjectId, status: { $nin: ['cancelled'] } },
        { $set: { status: 'disputed', updatedAt: now } }
      );
    }

    await this.auditService.log({
      actorId: userId,
      action: 'dispute:created',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: {
        disputeNumber,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      },
    });

    return this.mapDisputeToDto(disputeDoc);
  }

  async getUserDisputes(userId: string): Promise<DisputeDto[]> {
    const disputes = await this.getDisputesCollection()
      .find({
        $or: [{ initiatorId: userId }, { respondentId: userId }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return disputes.map((d) => this.mapDisputeToDto(d));
  }

  async getDisputeById(
    userId: string,
    userRoles: string[],
    disputeId: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    const isStaff = userRoles.includes('admin') || userRoles.includes('support');
    if (
      dispute.initiatorId !== userId &&
      dispute.respondentId !== userId &&
      !isStaff
    ) {
      throw new ForbiddenError('You are not authorized to view this dispute');
    }

    return this.mapDisputeToDto(dispute);
  }

  async submitEvidence(
    userId: string,
    disputeId: string,
    input: SubmitEvidenceInput,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    if (dispute.initiatorId !== userId && dispute.respondentId !== userId) {
      throw new ForbiddenError('Only dispute participants can submit evidence');
    }

    if (!['open', 'under_review', 'awaiting_evidence'].includes(dispute.status)) {
      throw new ConflictError(
        `Cannot submit evidence in dispute status '${dispute.status}'`,
        'INVALID_TRANSITION'
      );
    }

    if (!input.description || input.description.trim().length === 0) {
      throw new ValidationError('Evidence description is required');
    }

    const now = new Date();
    const role = userId === dispute.initiatorId ? 'initiator' : 'respondent';

    const evidence = {
      id: randomUUID(),
      submittedBy: userId,
      role: role as 'initiator' | 'respondent',
      description: input.description.trim(),
      attachmentUrls: input.attachmentUrls || [],
      submittedAt: now,
    };

    const newStatus = dispute.status === 'awaiting_evidence' ? 'under_review' : dispute.status;

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $push: { evidenceList: evidence },
        $set: { status: newStatus, updatedAt: now },
      }
    );

    await this.auditService.log({
      actorId: userId,
      action: 'dispute:evidence_submitted',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { evidenceId: evidence.id, role },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  async adminListDisputes(query: {
    status?: string;
    subjectType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ disputes: DisputeDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.subjectType) filter.subjectType = query.subjectType;

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const total = await this.getDisputesCollection().countDocuments(filter);
    const docs = await this.getDisputesCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      disputes: docs.map((d) => this.mapDisputeToDto(d)),
      total,
    };
  }

  async adminAssignDispute(
    staffId: string,
    disputeId: string,
    reviewerId: string,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    const now = new Date();
    const newStatus = dispute.status === 'open' ? 'under_review' : dispute.status;

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $set: {
          assignedReviewerId: reviewerId,
          status: newStatus,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'dispute:assigned',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { reviewerId },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  async adminRequestEvidence(
    staffId: string,
    disputeId: string,
    input: RequestEvidenceInput,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    if (!['open', 'under_review'].includes(dispute.status)) {
      throw new ConflictError(
        `Cannot request evidence in status '${dispute.status}'`,
        'INVALID_TRANSITION'
      );
    }

    const now = new Date();
    const days = input.deadlineDays || 5;
    const deadline = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'awaiting_evidence',
          evidenceRequestDescription: input.description.trim(),
          evidenceDeadline: deadline,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'dispute:evidence_requested',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { deadline: deadline.toISOString(), description: input.description },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  async adminIssueDecision(
    staffId: string,
    disputeId: string,
    input: IssueDecisionInput,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    if (!['open', 'under_review', 'awaiting_evidence'].includes(dispute.status)) {
      throw new ConflictError(
        `Cannot issue decision in status '${dispute.status}'`,
        'INVALID_TRANSITION'
      );
    }

    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('Decision reason is required');
    }

    const now = new Date();
    const decision = {
      issuedBy: staffId,
      outcome: input.outcome,
      reason: input.reason.trim(),
      issuedAt: now,
    };

    // Apply outcome transition to owning aggregate
    await this.applyDisputeOutcomeToAggregate(dispute, input.outcome, input.reason.trim());

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'decision_issued',
          initialDecision: decision,
          finalOutcome: input.outcome,
          finalReason: input.reason.trim(),
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'dispute:decision_issued',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { outcome: input.outcome, reason: input.reason },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  async appealDispute(
    userId: string,
    disputeId: string,
    input: AppealDisputeInput,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    if (dispute.initiatorId !== userId && dispute.respondentId !== userId) {
      throw new ForbiddenError('Only dispute participants can appeal');
    }

    if (dispute.status !== 'decision_issued') {
      throw new ConflictError(
        `Appeal can only be requested on 'decision_issued' status, current is '${dispute.status}'`,
        'INVALID_TRANSITION'
      );
    }

    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('Appeal reason is required');
    }

    const now = new Date();
    const appeal = {
      requestedBy: userId,
      reason: input.reason.trim(),
      evidenceUrls: input.evidenceUrls || [],
      requestedAt: now,
    };

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'appeal_requested',
          appeal,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: userId,
      action: 'dispute:appeal_requested',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { reason: input.reason },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  async adminAppealDecision(
    staffId: string,
    disputeId: string,
    input: AppealDecisionInput,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    if (dispute.status !== 'appeal_requested') {
      throw new ConflictError(
        `Appeal decision can only be issued on 'appeal_requested', current is '${dispute.status}'`,
        'INVALID_TRANSITION'
      );
    }

    // Separation of Duties (SoD) Invariant:
    // The second reviewer deciding the appeal MUST NOT be the reviewer who issued the initial decision.
    if (dispute.initialDecision?.issuedBy === staffId) {
      throw new ForbiddenError(
        'Separation of Duties violation: The reviewer deciding the appeal cannot be the same staff member who issued the initial decision.'
      );
    }

    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('Appeal decision reason is required');
    }

    const now = new Date();
    const secondDecision = {
      issuedBy: staffId,
      outcome: input.outcome,
      reason: input.reason.trim(),
      issuedAt: now,
    };

    // Apply appeal outcome to aggregate
    await this.applyDisputeOutcomeToAggregate(dispute, input.outcome, input.reason.trim());

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'resolved',
          'appeal.secondReviewerId': staffId,
          'appeal.secondReviewDecision': secondDecision,
          finalOutcome: input.outcome,
          finalReason: input.reason.trim(),
          resolvedAt: now,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'dispute:appeal_resolved',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { outcome: input.outcome, reason: input.reason },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  async adminDismissDispute(
    staffId: string,
    disputeId: string,
    reason: string,
    requestId?: string
  ): Promise<DisputeDto> {
    const dispute = await this.getDisputesCollection().findOne({ _id: disputeId });
    if (!dispute) {
      throw new NotFoundError('Dispute not found');
    }

    if (!['open', 'under_review'].includes(dispute.status)) {
      throw new ConflictError(
        `Cannot dismiss dispute in status '${dispute.status}'`,
        'INVALID_TRANSITION'
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Dismissal reason is required');
    }

    const now = new Date();

    // Revert dispute status on order back to in_progress or completed
    if (dispute.subjectType === 'service_order') {
      await this.getServiceOrdersCollection().updateOne(
        { _id: dispute.subjectId, status: 'disputed' },
        { $set: { status: 'in_progress', updatedAt: now } }
      );
    } else if (dispute.subjectType === 'merchant_order') {
      await this.getMerchantOrdersCollection().updateOne(
        { _id: dispute.subjectId, status: 'disputed' },
        { $set: { status: 'delivered', updatedAt: now } }
      );
    }

    await this.getDisputesCollection().updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'dismissed',
          finalReason: reason.trim(),
          resolvedAt: now,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'dispute:dismissed',
      targetType: 'dispute',
      targetId: disputeId,
      requestId,
      metadata: { reason },
    });

    const updated = await this.getDisputesCollection().findOne({ _id: disputeId });
    return this.mapDisputeToDto(updated!);
  }

  private async applyDisputeOutcomeToAggregate(
    dispute: DisputeDoc,
    outcome: string,
    reason: string
  ): Promise<void> {
    const now = new Date();

    if (dispute.subjectType === 'service_order') {
      if (outcome === 'resume_service') {
        await this.getServiceOrdersCollection().updateOne(
          { _id: dispute.subjectId },
          { $set: { status: 'in_progress', updatedAt: now } }
        );
      } else if (outcome === 'complete_service') {
        await this.getServiceOrdersCollection().updateOne(
          { _id: dispute.subjectId },
          { $set: { status: 'completed', completedAt: now, updatedAt: now } }
        );
      } else if (outcome === 'cancel_service') {
        await this.getServiceOrdersCollection().updateOne(
          { _id: dispute.subjectId },
          {
            $set: {
              status: 'cancelled',
              cancelledAt: now,
              cancellationReason: reason,
              updatedAt: now,
            },
          }
        );
      }
    } else if (dispute.subjectType === 'merchant_order') {
      if (outcome === 'complete_delivery') {
        await this.getMerchantOrdersCollection().updateOne(
          { _id: dispute.subjectId },
          { $set: { status: 'completed', updatedAt: now } }
        );
      } else if (outcome === 'cancel_order') {
        await this.getMerchantOrdersCollection().updateOne(
          { _id: dispute.subjectId },
          { $set: { status: 'cancelled', updatedAt: now } }
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ── Return Requests ──
  // ══════════════════════════════════════════════════════════════

  async createReturnRequest(
    customerId: string,
    input: CreateReturnRequestInput,
    requestId?: string
  ): Promise<ReturnRequestDto> {
    if (!input.orderId) {
      throw new ValidationError('orderId is required');
    }
    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
      throw new ValidationError('At least one item must be included in return request');
    }

    const order = await this.getMerchantOrdersCollection().findOne({ _id: input.orderId });
    if (!order) {
      throw new NotFoundError('Merchant order not found');
    }

    if (order.customerId !== customerId) {
      throw new ForbiddenError('You can only request returns for your own orders');
    }

    if (!['delivered', 'completed'].includes(order.status)) {
      throw new ConflictError(
        `Returns can only be requested on delivered or completed orders (current: ${order.status})`,
        'INVALID_TRANSITION'
      );
    }

    // Validate quantities against ordered items
    for (const item of input.items) {
      const orderItem = order.items.find((i) => i.productId === item.productId);
      if (!orderItem) {
        throw new ValidationError(`Product ${item.productId} is not part of this order`);
      }
      if (item.quantity <= 0 || item.quantity > orderItem.quantity) {
        throw new ValidationError(
          `Invalid return quantity ${item.quantity} for product ${item.productId} (ordered: ${orderItem.quantity})`
        );
      }
    }

    const returnId = randomUUID();
    const returnNumber = `RET-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    const returnDoc: ReturnRequestDoc = {
      _id: returnId,
      returnNumber,
      orderId: input.orderId,
      storeId: order.storeId,
      customerId,
      merchantId: order.merchantUserId,
      status: 'requested',
      items: input.items,
      createdAt: now,
      updatedAt: now,
    };

    await this.getReturnRequestsCollection().insertOne(returnDoc);

    await this.auditService.log({
      actorId: customerId,
      action: 'return_request:created',
      targetType: 'return_request',
      targetId: returnId,
      requestId,
      metadata: { returnNumber, orderId: input.orderId, storeId: order.storeId },
    });

    return this.mapReturnToDto(returnDoc);
  }

  async getCustomerReturnRequests(customerId: string): Promise<ReturnRequestDto[]> {
    const docs = await this.getReturnRequestsCollection()
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((d) => this.mapReturnToDto(d));
  }

  async getMerchantReturnRequests(merchantUserId: string): Promise<ReturnRequestDto[]> {
    const docs = await this.getReturnRequestsCollection()
      .find({ merchantId: merchantUserId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((d) => this.mapReturnToDto(d));
  }

  async getReturnRequestById(
    userId: string,
    userRoles: string[],
    returnId: string
  ): Promise<ReturnRequestDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    const isStaff = userRoles.includes('admin') || userRoles.includes('support');
    if (
      returnReq.customerId !== userId &&
      returnReq.merchantId !== userId &&
      !isStaff
    ) {
      throw new ForbiddenError('You are not authorized to view this return request');
    }

    return this.mapReturnToDto(returnReq);
  }

  async merchantReviewReturn(
    merchantUserId: string,
    returnId: string,
    input: ReviewReturnInput,
    requestId?: string
  ): Promise<ReturnRequestDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    if (returnReq.merchantId !== merchantUserId) {
      throw new ForbiddenError('Only the store owner merchant can review this return');
    }

    if (!['requested', 'under_review'].includes(returnReq.status)) {
      throw new ConflictError(
        `Cannot review return in status '${returnReq.status}'`,
        'INVALID_TRANSITION'
      );
    }

    const now = new Date();
    const newStatus = input.approved ? 'awaiting_return' : 'rejected';

    await this.getReturnRequestsCollection().updateOne(
      { _id: returnId },
      {
        $set: {
          status: newStatus,
          rejectionReason: input.approved ? undefined : input.reason,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'return_request:reviewed',
      targetType: 'return_request',
      targetId: returnId,
      requestId,
      metadata: { approved: input.approved, reason: input.reason },
    });

    const updated = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    return this.mapReturnToDto(updated!);
  }

  async customerShipReturn(
    customerId: string,
    returnId: string,
    requestId?: string
  ): Promise<ReturnRequestDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    if (returnReq.customerId !== customerId) {
      throw new ForbiddenError('Only the customer can update shipping for this return');
    }

    if (returnReq.status !== 'awaiting_return') {
      throw new ConflictError(
        `Cannot mark return as shipped in status '${returnReq.status}'`,
        'INVALID_TRANSITION'
      );
    }

    const now = new Date();
    await this.getReturnRequestsCollection().updateOne(
      { _id: returnId },
      {
        $set: {
          status: 'in_transit',
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: customerId,
      action: 'return_request:shipped',
      targetType: 'return_request',
      targetId: returnId,
      requestId,
    });

    const updated = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    return this.mapReturnToDto(updated!);
  }

  async merchantReceiveReturn(
    merchantUserId: string,
    returnId: string,
    requestId?: string
  ): Promise<ReturnRequestDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    if (returnReq.merchantId !== merchantUserId) {
      throw new ForbiddenError('Only the store owner merchant can receive this return');
    }

    if (returnReq.status !== 'in_transit') {
      throw new ConflictError(
        `Cannot mark return as received in status '${returnReq.status}'`,
        'INVALID_TRANSITION'
      );
    }

    const now = new Date();
    await this.getReturnRequestsCollection().updateOne(
      { _id: returnId },
      {
        $set: {
          status: 'inspecting',
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'return_request:received',
      targetType: 'return_request',
      targetId: returnId,
      requestId,
    });

    const updated = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    return this.mapReturnToDto(updated!);
  }

  async merchantInspectReturn(
    merchantUserId: string,
    returnId: string,
    input: InspectReturnInput,
    requestId?: string
  ): Promise<ReturnRequestDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    if (returnReq.merchantId !== merchantUserId) {
      throw new ForbiddenError('Only the store owner merchant can inspect this return');
    }

    if (!['inspecting', 'received'].includes(returnReq.status)) {
      throw new ConflictError(
        `Cannot inspect return in status '${returnReq.status}'`,
        'INVALID_TRANSITION'
      );
    }

    if (!input.conditionNotes || input.conditionNotes.trim().length === 0) {
      throw new ValidationError('Condition notes are required');
    }

    const now = new Date();
    const inspection = {
      inspectedBy: merchantUserId,
      conditionNotes: input.conditionNotes.trim(),
      result: input.result,
      inspectedAt: now,
      evidenceUrls: input.evidenceUrls || [],
    };

    const newStatus = input.result === 'accepted' ? 'accepted' : 'rejected';

    await this.getReturnRequestsCollection().updateOne(
      { _id: returnId },
      {
        $set: {
          merchantInspection: inspection,
          status: newStatus,
          rejectionReason: input.result === 'rejected' ? input.conditionNotes.trim() : undefined,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'return_request:inspected',
      targetType: 'return_request',
      targetId: returnId,
      requestId,
      metadata: { result: input.result },
    });

    const updated = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    return this.mapReturnToDto(updated!);
  }

  async merchantResolveReturn(
    merchantUserId: string,
    returnId: string,
    input: ResolveReturnInput,
    requestId?: string
  ): Promise<ReturnRequestDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    if (returnReq.merchantId !== merchantUserId) {
      throw new ForbiddenError('Only the store owner merchant can resolve this return');
    }

    if (returnReq.status !== 'accepted') {
      throw new ConflictError(
        `Cannot resolve return in status '${returnReq.status}' (must be 'accepted')`,
        'INVALID_TRANSITION'
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      resolution: input.resolution,
      resolutionNotes: input.resolutionNotes?.trim(),
      status: 'resolved',
      updatedAt: now,
    };

    if (input.codRefundAmountPiastres && input.codRefundAmountPiastres > 0) {
      updateData.codRefundReport = {
        reportedBy: merchantUserId,
        amountPiastres: input.codRefundAmountPiastres,
        method: input.codRefundMethod || 'cash',
        isAssertion: true,
        disclaimer:
          'This is a merchant-reported COD cash refund assertion. The platform does not hold, guarantee, or process physical cash refunds.',
        reportedAt: now,
      };
    }

    await this.getReturnRequestsCollection().updateOne(
      { _id: returnId },
      { $set: updateData }
    );

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'return_request:resolved',
      targetType: 'return_request',
      targetId: returnId,
      requestId,
      metadata: {
        resolution: input.resolution,
        hasCodRefund: !!input.codRefundAmountPiastres,
      },
    });

    const updated = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    return this.mapReturnToDto(updated!);
  }

  async escalateReturnToDispute(
    customerId: string,
    returnId: string,
    reason: string,
    requestId?: string
  ): Promise<DisputeDto> {
    const returnReq = await this.getReturnRequestsCollection().findOne({ _id: returnId });
    if (!returnReq) {
      throw new NotFoundError('Return request not found');
    }

    if (returnReq.customerId !== customerId) {
      throw new ForbiddenError('Only the customer can dispute a rejected return');
    }

    if (returnReq.status !== 'rejected') {
      throw new ConflictError(
        `Only rejected returns can be escalated to dispute (current: ${returnReq.status})`,
        'INVALID_TRANSITION'
      );
    }

    // Open dispute against the merchant order
    const dispute = await this.createDispute(
      customerId,
      {
        subjectType: 'merchant_order',
        subjectId: returnReq.orderId,
        reason: `Return Rejected Dispute: ${reason.trim()}`,
        initialEvidenceDescription: `Customer disputed rejected return ${returnReq.returnNumber}: ${reason.trim()}`,
      },
      requestId
    );

    await this.getReturnRequestsCollection().updateOne(
      { _id: returnId },
      { $set: { disputeId: dispute.id, updatedAt: new Date() } }
    );

    return dispute;
  }

  // ══════════════════════════════════════════════════════════════
  // ── DTO Mappers ──
  // ══════════════════════════════════════════════════════════════

  private mapTicketToDto(doc: SupportTicketDoc): SupportTicketDto {
    return {
      id: doc._id,
      ticketNumber: doc.ticketNumber,
      userId: doc.userId,
      userRole: doc.userRole,
      subject: doc.subject,
      category: doc.category,
      priority: doc.priority,
      status: doc.status,
      assignedStaffId: doc.assignedStaffId,
      relatedOrderId: doc.relatedOrderId,
      relatedOrderType: doc.relatedOrderType,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      closedAt: doc.closedAt?.toISOString(),
    };
  }

  private mapMessageToDto(doc: SupportMessageDoc): SupportMessageDto {
    return {
      id: doc._id,
      ticketId: doc.ticketId,
      senderId: doc.senderId,
      senderRole: doc.senderRole,
      message: doc.message,
      attachments: doc.attachments,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private mapReportToDto(doc: ReportDoc): ReportDto {
    return {
      id: doc._id,
      reporterId: doc.reporterId,
      targetType: doc.targetType,
      targetId: doc.targetId,
      reason: doc.reason,
      details: doc.details,
      evidenceUrls: doc.evidenceUrls,
      status: doc.status,
      assignedStaffId: doc.assignedStaffId,
      resolutionReason: doc.resolutionReason,
      actionTaken: doc.actionTaken,
      resolvedAt: doc.resolvedAt?.toISOString(),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private mapDisputeToDto(doc: DisputeDoc): DisputeDto {
    return {
      id: doc._id,
      disputeNumber: doc.disputeNumber,
      subjectType: doc.subjectType,
      subjectId: doc.subjectId,
      initiatorId: doc.initiatorId,
      respondentId: doc.respondentId,
      reason: doc.reason,
      status: doc.status,
      evidenceDeadline: doc.evidenceDeadline?.toISOString(),
      evidenceRequestDescription: doc.evidenceRequestDescription,
      evidenceList: doc.evidenceList.map((e) => ({
        id: e.id,
        submittedBy: e.submittedBy,
        role: e.role,
        description: e.description,
        attachmentUrls: e.attachmentUrls,
        submittedAt: e.submittedAt.toISOString(),
      })),
      assignedReviewerId: doc.assignedReviewerId,
      initialDecision: doc.initialDecision
        ? {
            issuedBy: doc.initialDecision.issuedBy,
            outcome: doc.initialDecision.outcome,
            reason: doc.initialDecision.reason,
            issuedAt: doc.initialDecision.issuedAt.toISOString(),
          }
        : undefined,
      appeal: doc.appeal
        ? {
            requestedBy: doc.appeal.requestedBy,
            reason: doc.appeal.reason,
            evidenceUrls: doc.appeal.evidenceUrls,
            requestedAt: doc.appeal.requestedAt.toISOString(),
            secondReviewerId: doc.appeal.secondReviewerId,
            secondReviewDecision: doc.appeal.secondReviewDecision
              ? {
                  issuedBy: doc.appeal.secondReviewDecision.issuedBy,
                  outcome: doc.appeal.secondReviewDecision.outcome,
                  reason: doc.appeal.secondReviewDecision.reason,
                  issuedAt: doc.appeal.secondReviewDecision.issuedAt.toISOString(),
                }
              : undefined,
          }
        : undefined,
      finalOutcome: doc.finalOutcome,
      finalReason: doc.finalReason,
      resolvedAt: doc.resolvedAt?.toISOString(),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private mapReturnToDto(doc: ReturnRequestDoc): ReturnRequestDto {
    return {
      id: doc._id,
      returnNumber: doc.returnNumber,
      orderId: doc.orderId,
      storeId: doc.storeId,
      customerId: doc.customerId,
      merchantId: doc.merchantId,
      status: doc.status,
      items: doc.items,
      rejectionReason: doc.rejectionReason,
      merchantInspection: doc.merchantInspection
        ? {
            inspectedBy: doc.merchantInspection.inspectedBy,
            conditionNotes: doc.merchantInspection.conditionNotes,
            result: doc.merchantInspection.result,
            inspectedAt: doc.merchantInspection.inspectedAt.toISOString(),
            evidenceUrls: doc.merchantInspection.evidenceUrls,
          }
        : undefined,
      resolution: doc.resolution,
      resolutionNotes: doc.resolutionNotes,
      codRefundReport: doc.codRefundReport
        ? {
            reportedBy: doc.codRefundReport.reportedBy,
            amountPiastres: doc.codRefundReport.amountPiastres,
            method: doc.codRefundReport.method,
            isAssertion: true,
            disclaimer: doc.codRefundReport.disclaimer,
            reportedAt: doc.codRefundReport.reportedAt.toISOString(),
          }
        : undefined,
      disputeId: doc.disputeId,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
