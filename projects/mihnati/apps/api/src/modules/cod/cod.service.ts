import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import { MerchantOrderDoc } from '../commerce/commerce.types.js';
import {
  CodReportDoc,
  CodReportDto,
  CodDisputeDoc,
  CodDisputeDto,
  CreateCodReportInput,
  CreateCodDisputeInput,
  ResolveCodDisputeInput,
  CodDisputeStatus,
} from './cod.types.js';

const COD_ASSERTION_DISCLAIMER =
  'This report represents a merchant assertion of cash collected or failed in the field. The platform does not hold, guarantee, or process these funds.';

export class CodService {
  constructor(private auditService: AuditService) {}

  private getOrdersCollection() {
    return getDb().collection<MerchantOrderDoc>('merchant_orders');
  }

  private getReportsCollection() {
    return getDb().collection<CodReportDoc>('cod_reports');
  }

  private getDisputesCollection() {
    return getDb().collection<CodDisputeDoc>('cod_disputes');
  }

  // ══════════════════════════════════════════════════════════════
  // ── Merchant COD Reporting (E14-T01) ──
  // ══════════════════════════════════════════════════════════════

  async createReport(
    merchantUserId: string,
    orderId: string,
    input: CreateCodReportInput,
    requestId?: string
  ): Promise<CodReportDto> {
    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status === 'cancelled' || order.status === 'rejected') {
      throw new ConflictError(
        `Cannot submit COD collection report for order with status "${order.status}". No cash collection is due.`
      );
    }

    let amount = 0;
    if (input.status === 'collected') {
      amount = input.amountCollectedPiastres ?? order.codExpectedPiastres;
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new ValidationError('Collected amount must be a positive integer in piastres');
      }
    } else {
      amount = 0;
      if (!input.reason || input.reason.trim().length < 3) {
        throw new ValidationError(
          'A detailed reason is required when reporting failure to collect cash'
        );
      }
    }

    const now = new Date();
    const reportDoc: CodReportDoc = {
      _id: randomUUID(),
      orderId,
      orderNumber: order.orderNumber,
      merchantUserId,
      storeId: order.storeId,
      status: input.status,
      amountCollectedPiastres: amount,
      expectedPiastres: order.codExpectedPiastres,
      reason: input.reason?.trim(),
      proofRefs: input.proofRefs,
      notes: input.notes?.trim(),
      isAssertion: true,
      createdAt: now,
    };

    await this.getReportsCollection().insertOne(reportDoc);

    // Update paymentStatus in merchant_orders
    const newPaymentStatus =
      input.status === 'collected'
        ? 'merchant_reported_collected'
        : 'merchant_reported_not_collected';

    await ordersCol.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentStatus: newPaymentStatus as any,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'cod:report_submitted',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: input.reason?.trim() || 'Merchant submitted cash on delivery report',
      metadata: {
        orderNumber: order.orderNumber,
        collectionStatus: input.status,
        amountCollectedPiastres: amount,
        expectedPiastres: order.codExpectedPiastres,
      },
      requestId,
    });

    return this.toReportDto(reportDoc);
  }

  async listOrderReports(
    userId: string,
    isMerchant: boolean,
    orderId: string
  ): Promise<CodReportDto[]> {
    const order = await this.getOrdersCollection().findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');

    if (isMerchant && order.merchantUserId !== userId) {
      throw new ForbiddenError('You do not own this order');
    }
    if (!isMerchant && order.customerId !== userId) {
      throw new ForbiddenError('You do not have access to this order');
    }

    const docs = await this.getReportsCollection()
      .find({ orderId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((d) => this.toReportDto(d));
  }

  // ══════════════════════════════════════════════════════════════
  // ── Customer COD Dispute (E14-T02) ──
  // ══════════════════════════════════════════════════════════════

  async openDispute(
    customerId: string,
    orderId: string,
    input: CreateCodDisputeInput,
    requestId?: string
  ): Promise<CodDisputeDto> {
    if (!input.disputeReason || input.disputeReason.trim().length < 5) {
      throw new ValidationError(
        'Dispute reason must be detailed and at least 5 characters long'
      );
    }

    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.customerId !== customerId) {
      throw new ForbiddenError('You do not have access to this order');
    }

    // Check if an active dispute already exists
    const disputesCol = this.getDisputesCollection();
    const existing = await disputesCol.findOne({
      orderId,
      status: { $in: ['open', 'under_review'] },
    });
    if (existing) {
      throw new ConflictError(
        'An active COD dispute already exists for this order',
        'DUPLICATE_DISPUTE'
      );
    }

    const now = new Date();
    const disputeDoc: CodDisputeDoc = {
      _id: randomUUID(),
      orderId,
      orderNumber: order.orderNumber,
      customerId,
      merchantUserId: order.merchantUserId,
      storeId: order.storeId,
      disputeReason: input.disputeReason.trim(),
      customerClaimedAmountPiastres: input.customerClaimedAmountPiastres,
      evidenceMediaRefs: input.evidenceMediaRefs,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    await disputesCol.insertOne(disputeDoc);

    // Update order payment status to discrepancy_reported
    await ordersCol.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentStatus: 'discrepancy_reported' as any,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: customerId,
      action: 'cod:dispute_opened',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: input.disputeReason.trim(),
      metadata: {
        orderNumber: order.orderNumber,
        customerClaimedAmount: input.customerClaimedAmountPiastres,
      },
      requestId,
    });

    return this.toDisputeDto(disputeDoc);
  }

  async listOrderDisputes(userId: string, orderId: string): Promise<CodDisputeDto[]> {
    const order = await this.getOrdersCollection().findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');

    if (order.customerId !== userId && order.merchantUserId !== userId) {
      throw new ForbiddenError('You do not have access to disputes for this order');
    }

    const docs = await this.getDisputesCollection()
      .find({ orderId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((d) => this.toDisputeDto(d));
  }

  // ══════════════════════════════════════════════════════════════
  // ── Staff Dispute Review & Resolution (E14-T02) ──
  // ══════════════════════════════════════════════════════════════

  async listDisputesForStaff(status?: CodDisputeStatus): Promise<CodDisputeDto[]> {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter['status'] = status;
    }

    const docs = await this.getDisputesCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((d) => this.toDisputeDto(d));
  }

  async assignStaffToDispute(
    staffId: string,
    disputeId: string,
    requestId?: string
  ): Promise<CodDisputeDto> {
    const disputesCol = this.getDisputesCollection();
    const dispute = await disputesCol.findOne({ _id: disputeId });
    if (!dispute) throw new NotFoundError('Dispute not found');

    if (dispute.status === 'resolved' || dispute.status === 'dismissed') {
      throw new ConflictError(
        `Cannot assign staff to a dispute with status "${dispute.status}".`
      );
    }

    const now = new Date();
    await disputesCol.updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'under_review',
          assignedStaffId: staffId,
          updatedAt: now,
        },
      }
    );

    // Update order payment status to under_review
    await this.getOrdersCollection().updateOne(
      { _id: dispute.orderId },
      {
        $set: {
          paymentStatus: 'under_review' as any,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'cod:dispute_assigned',
      targetType: 'cod_dispute',
      targetId: disputeId,
      reason: 'Staff reviewer assigned to COD discrepancy case',
      metadata: { orderId: dispute.orderId, assignedStaffId: staffId },
      requestId,
    });

    const updated = await disputesCol.findOne({ _id: disputeId });
    return this.toDisputeDto(updated!);
  }

  async resolveDispute(
    staffId: string,
    disputeId: string,
    input: ResolveCodDisputeInput,
    requestId?: string
  ): Promise<CodDisputeDto> {
    if (!input.resolutionNotes || input.resolutionNotes.trim().length < 5) {
      throw new ValidationError(
        'Resolution notes are required and must be at least 5 characters'
      );
    }

    const disputesCol = this.getDisputesCollection();
    const dispute = await disputesCol.findOne({ _id: disputeId });
    if (!dispute) throw new NotFoundError('Dispute not found');

    if (dispute.status === 'resolved' || dispute.status === 'dismissed') {
      throw new ConflictError(
        `Dispute is already in terminal status "${dispute.status}".`
      );
    }

    const now = new Date();
    await disputesCol.updateOne(
      { _id: disputeId },
      {
        $set: {
          status: 'resolved',
          resolutionOutcome: input.resolutionOutcome,
          resolutionNotes: input.resolutionNotes.trim(),
          resolvedAt: now,
          updatedAt: now,
        },
      }
    );

    // Mark order paymentStatus as closed (per state machine)
    await this.getOrdersCollection().updateOne(
      { _id: dispute.orderId },
      {
        $set: {
          paymentStatus: 'closed' as any,
          updatedAt: now,
        },
      }
    );

    await this.auditService.log({
      actorId: staffId,
      action: 'cod:dispute_resolved',
      targetType: 'cod_dispute',
      targetId: disputeId,
      reason: input.resolutionNotes.trim(),
      metadata: {
        outcome: input.resolutionOutcome,
        orderId: dispute.orderId,
      },
      requestId,
    });

    const updated = await disputesCol.findOne({ _id: disputeId });
    return this.toDisputeDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Helpers ──
  // ══════════════════════════════════════════════════════════════

  private toReportDto(r: CodReportDoc): CodReportDto {
    return {
      id: r._id,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      storeId: r.storeId,
      status: r.status,
      amountCollectedPiastres: r.amountCollectedPiastres,
      expectedPiastres: r.expectedPiastres,
      reason: r.reason,
      proofRefs: r.proofRefs,
      notes: r.notes,
      isAssertion: true,
      disclaimer: COD_ASSERTION_DISCLAIMER,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toDisputeDto(d: CodDisputeDoc): CodDisputeDto {
    return {
      id: d._id,
      orderId: d.orderId,
      orderNumber: d.orderNumber,
      customerId: d.customerId,
      disputeReason: d.disputeReason,
      customerClaimedAmountPiastres: d.customerClaimedAmountPiastres,
      evidenceMediaRefs: d.evidenceMediaRefs,
      status: d.status,
      assignedStaffId: d.assignedStaffId,
      resolutionNotes: d.resolutionNotes,
      resolutionOutcome: d.resolutionOutcome,
      resolvedAt: d.resolvedAt?.toISOString(),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}

