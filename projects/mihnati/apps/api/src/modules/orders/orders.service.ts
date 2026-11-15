import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  ServiceOrderDoc,
  ServiceOrderDto,
  AppointmentDoc,
  OrderChangeRequestDoc,
  AddressConsentLogDoc,
  ExecutionAddressDto,
} from './orders.types.js';
import { ServiceRequestDoc } from '../requests/requests.types.js';
import { ProfessionalProfileDoc } from '../roles/role.types.js';
import { GovernorateDoc, LocalityDoc } from '../geography/geography.types.js';

export interface ProposeAppointmentInput {
  scheduledAt: Date;
  timezone?: string;
  notes?: string;
}

export interface ProposeChangeInput {
  proposedPricePiastres?: number;
  proposedScopeSummary?: string;
  reason: string;
}

export class OrdersService {
  constructor(private auditService: AuditService) {}

  private getOrdersCollection() {
    return getDb().collection<ServiceOrderDoc>('service_orders');
  }

  private getAppointmentsCollection() {
    return getDb().collection<AppointmentDoc>('appointments');
  }

  private getChangesCollection() {
    return getDb().collection<OrderChangeRequestDoc>('order_change_requests');
  }

  private getConsentLogsCollection() {
    return getDb().collection<AddressConsentLogDoc>('address_consent_logs');
  }

  // ── Authorization & Access Helpers ──

  async getOrder(userId: string, orderId: string): Promise<ServiceOrderDoc> {
    const order = await this.getOrdersCollection().findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Service order not found');

    const db = getDb();
    const proProfile = await db
      .collection<ProfessionalProfileDoc>('professional_profiles')
      .findOne({ userId });

    const isCustomer = order.customerId === userId;
    const isAssignedPro =
      order.professionalUserId === userId ||
      (proProfile && order.professionalProfileId === proProfile._id);

    if (!isCustomer && !isAssignedPro) {
      throw new ForbiddenError('You are not a participant in this service order');
    }

    return order;
  }

  async listMyOrders(userId: string): Promise<ServiceOrderDto[]> {
    const db = getDb();
    const proProfile = await db
      .collection<ProfessionalProfileDoc>('professional_profiles')
      .findOne({ userId });

    const query: Record<string, unknown> = {
      $or: [
        { customerId: userId },
        { professionalUserId: userId },
        ...(proProfile ? [{ professionalProfileId: proProfile._id }] : []),
      ],
    };

    const orders = await this.getOrdersCollection()
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return orders.map((o) => this.toDto(o));
  }

  // ── Order State Transitions (AC-E08.1) ──

  async startOrder(userId: string, orderId: string): Promise<ServiceOrderDto> {
    const order = await this.getOrder(userId, orderId);
    if (order.status !== 'created' && order.status !== 'scheduled') {
      throw new ConflictError(`Cannot start order in status: ${order.status}`);
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { status: 'in_progress', updatedAt: now } }
    );

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  async submitOrder(userId: string, orderId: string): Promise<ServiceOrderDto> {
    const order = await this.getOrder(userId, orderId);
    if (order.status !== 'in_progress') {
      throw new ConflictError(`Only in_progress orders can be submitted. Current: ${order.status}`);
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { status: 'submitted', submittedAt: now, updatedAt: now } }
    );

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  async completeOrder(customerId: string, orderId: string): Promise<ServiceOrderDto> {
    const order = await this.getOrder(customerId, orderId);
    if (order.customerId !== customerId) {
      throw new ForbiddenError('Only the customer can confirm completion of the order');
    }
    if (order.status !== 'submitted' && order.status !== 'in_progress') {
      throw new ConflictError(`Cannot complete order in status: ${order.status}`);
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { status: 'completed', completedAt: now, updatedAt: now } }
    );

    // Atomically close the underlying service request
    const db = getDb();
    await db
      .collection<ServiceRequestDoc>('service_requests')
      .updateOne({ _id: order.serviceRequestId }, { $set: { status: 'completed', updatedAt: now } });

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  async disputeOrder(userId: string, orderId: string, reason: string): Promise<ServiceOrderDto> {
    const order = await this.getOrder(userId, orderId);
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new ConflictError(`Cannot dispute an already ${order.status} order`);
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { status: 'disputed', disputeReason: reason.trim(), updatedAt: now } }
    );

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  async cancelOrder(userId: string, orderId: string, reason: string): Promise<ServiceOrderDto> {
    const order = await this.getOrder(userId, orderId);
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new ConflictError(`Order is already ${order.status}`);
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { status: 'cancelled', cancelledAt: now, cancellationReason: reason.trim(), updatedAt: now } }
    );

    // Update service request status to cancelled
    const db = getDb();
    await db
      .collection<ServiceRequestDoc>('service_requests')
      .updateOne({ _id: order.serviceRequestId }, { $set: { status: 'cancelled', updatedAt: now } });

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  // ── Appointment Workflow (AC-E08.2) ──

  async proposeAppointment(
    userId: string,
    orderId: string,
    input: ProposeAppointmentInput
  ): Promise<AppointmentDoc> {
    const order = await this.getOrder(userId, orderId);
    const proposedBy = order.customerId === userId ? 'customer' : 'professional';

    const now = new Date();
    const doc: AppointmentDoc = {
      _id: randomUUID(),
      serviceOrderId: orderId,
      proposedBy,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone || 'Africa/Cairo',
      notes: input.notes?.trim(),
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
    };

    await this.getAppointmentsCollection().insertOne(doc);
    return doc;
  }

  async confirmAppointment(userId: string, appointmentId: string): Promise<AppointmentDoc> {
    const appt = await this.getAppointmentsCollection().findOne({ _id: appointmentId });
    if (!appt) throw new NotFoundError('Appointment not found');

    const order = await this.getOrder(userId, appt.serviceOrderId);
    const callerType = order.customerId === userId ? 'customer' : 'professional';
    if (appt.proposedBy === callerType) {
      throw new ValidationError('You cannot confirm an appointment that you proposed yourself');
    }

    const now = new Date();
    await this.getAppointmentsCollection().updateOne(
      { _id: appointmentId },
      { $set: { status: 'confirmed', updatedAt: now } }
    );

    // Update order status to scheduled
    await this.getOrdersCollection().updateOne(
      { _id: appt.serviceOrderId },
      { $set: { status: 'scheduled', scheduledAppointmentAt: appt.scheduledAt, updatedAt: now } }
    );

    return (await this.getAppointmentsCollection().findOne({ _id: appointmentId }))!;
  }

  // ── Address Consent & Reveal (AC-E08.3) ──

  async grantAddressConsent(
    customerId: string,
    orderId: string,
    ip?: string,
    requestId?: string
  ): Promise<ServiceOrderDto> {
    const order = await this.getOrder(customerId, orderId);
    if (order.customerId !== customerId) {
      throw new ForbiddenError('Only the customer can grant address consent');
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { addressConsentGranted: true, addressConsentGrantedAt: now, updatedAt: now } }
    );

    // Log in consent ledger
    await this.getConsentLogsCollection().insertOne({
      _id: randomUUID(),
      serviceOrderId: orderId,
      actorId: customerId,
      action: 'granted',
      ip,
      requestId,
      createdAt: now,
    });

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  async revokeAddressConsent(
    customerId: string,
    orderId: string,
    ip?: string,
    requestId?: string
  ): Promise<ServiceOrderDto> {
    const order = await this.getOrder(customerId, orderId);
    if (order.customerId !== customerId) {
      throw new ForbiddenError('Only the customer can revoke address consent');
    }

    const now = new Date();
    await this.getOrdersCollection().updateOne(
      { _id: orderId },
      { $set: { addressConsentGranted: false, addressConsentRevokedAt: now, updatedAt: now } }
    );

    // Log in consent ledger
    await this.getConsentLogsCollection().insertOne({
      _id: randomUUID(),
      serviceOrderId: orderId,
      actorId: customerId,
      action: 'revoked',
      ip,
      requestId,
      createdAt: now,
    });

    const updated = await this.getOrdersCollection().findOne({ _id: orderId });
    return this.toDto(updated!);
  }

  async getExecutionAddress(
    proUserId: string,
    orderId: string,
    ip?: string,
    requestId?: string
  ): Promise<ExecutionAddressDto> {
    const order = await this.getOrder(proUserId, orderId);
    if (order.customerId === proUserId) {
      throw new ForbiddenError('Execution address reveal endpoint is for the assigned professional');
    }

    // PRIVACY ENFORCEMENT (AC-E08.3):
    if (!order.addressConsentGranted) {
      throw new ForbiddenError('Customer has not granted address consent for this service order');
    }

    const db = getDb();
    const reqDoc = await db
      .collection<ServiceRequestDoc>('service_requests')
      .findOne({ _id: order.serviceRequestId });
    if (!reqDoc) throw new NotFoundError('Associated service request not found');

    const gov = await db.collection<GovernorateDoc>('governorates').findOne({ _id: reqDoc.governorateId });
    const loc = reqDoc.localityId
      ? await db.collection<LocalityDoc>('localities').findOne({ _id: reqDoc.localityId })
      : null;

    const now = new Date();

    // Log sensitive address access in consent ledger and audit
    await this.getConsentLogsCollection().insertOne({
      _id: randomUUID(),
      serviceOrderId: orderId,
      actorId: proUserId,
      action: 'revealed',
      ip,
      requestId,
      createdAt: now,
    });

    await this.auditService.log({
      actorId: proUserId,
      action: 'service_order:address_revealed',
      targetType: 'service_order',
      targetId: orderId,
      sensitivePurpose: 'Execution address accessed by assigned professional after customer consent',
      requestId,
    });

    return {
      serviceOrderId: order._id,
      governorate: gov?.nameAr || 'مصر',
      locality: loc?.nameAr,
      exactAddressText: reqDoc.exactAddressText,
      revealedAt: now.toISOString(),
    };
  }

  // ── Mutual Change Requests (AC-E08.3) ──

  async proposeChange(
    userId: string,
    orderId: string,
    input: ProposeChangeInput
  ): Promise<OrderChangeRequestDoc> {
    await this.getOrder(userId, orderId);

    if (input.proposedPricePiastres !== undefined) {
      if (!Number.isInteger(input.proposedPricePiastres) || input.proposedPricePiastres <= 0) {
        throw new ValidationError('Proposed price must be a positive integer in piastres');
      }
    }

    const now = new Date();
    const doc: OrderChangeRequestDoc = {
      _id: randomUUID(),
      serviceOrderId: orderId,
      requestedBy: userId,
      proposedPricePiastres: input.proposedPricePiastres,
      proposedScopeSummary: input.proposedScopeSummary?.trim(),
      reason: input.reason.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await this.getChangesCollection().insertOne(doc);
    return doc;
  }

  async decideChange(
    userId: string,
    changeRequestId: string,
    decision: 'accepted' | 'rejected',
    notes?: string
  ): Promise<OrderChangeRequestDoc> {
    const change = await this.getChangesCollection().findOne({ _id: changeRequestId });
    if (!change) throw new NotFoundError('Change request not found');
    if (change.status !== 'pending') {
      throw new ConflictError(`Change request is already ${change.status}`);
    }

    const order = await this.getOrder(userId, change.serviceOrderId);
    if (change.requestedBy === userId) {
      throw new ForbiddenError('You cannot decide on your own change request');
    }

    const now = new Date();
    await this.getChangesCollection().updateOne(
      { _id: changeRequestId },
      {
        $set: {
          status: decision,
          decidedBy: userId,
          decidedAt: now,
          decisionNotes: notes?.trim(),
          updatedAt: now,
        },
      }
    );

    // If accepted, update the order atomically!
    if (decision === 'accepted') {
      const orderUpdates: Partial<ServiceOrderDoc> = { updatedAt: now };
      if (change.proposedPricePiastres) {
        orderUpdates.pricePiastres = change.proposedPricePiastres;
      }
      if (change.proposedScopeSummary) {
        orderUpdates.scopeSummary = change.proposedScopeSummary;
      }
      await this.getOrdersCollection().updateOne({ _id: order._id }, { $set: orderUpdates });
    }

    return (await this.getChangesCollection().findOne({ _id: changeRequestId }))!;
  }

  // ── DTO Mapper ──

  private toDto(d: ServiceOrderDoc): ServiceOrderDto {
    return {
      id: d._id,
      serviceRequestId: d.serviceRequestId,
      offerId: d.offerId,
      customerId: d.customerId,
      professionalProfileId: d.professionalProfileId,
      pricePiastres: d.pricePiastres,
      status: d.status,
      scopeSummary: d.scopeSummary,
      addressConsentGranted: d.addressConsentGranted,
      scheduledAppointmentAt: d.scheduledAppointmentAt?.toISOString(),
      submittedAt: d.submittedAt?.toISOString(),
      completedAt: d.completedAt?.toISOString(),
      cancelledAt: d.cancelledAt?.toISOString(),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
