import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ProductDoc } from '../stores/stores.types.js';
import {
  MerchantOrderDoc,
  MerchantOrderDto,
  DeliveryAddressSnapshot,
  RejectOrderInput,
  DispatchOrderInput,
  MarkDeliveredInput,
  CancelOrderInput,
  ListOrdersQuery,
} from './merchant-orders.types.js';

export class MerchantOrdersService {
  constructor(
    private auditService: AuditService,
    private inventoryService: InventoryService
  ) {}

  private getOrdersCollection() {
    return getDb().collection<MerchantOrderDoc>('merchant_orders');
  }

  private getProductsCollection() {
    return getDb().collection<ProductDoc>('products');
  }

  // ══════════════════════════════════════════════════════════════
  // ── Customer Order Queries (E13-T01) ──
  // ══════════════════════════════════════════════════════════════

  async listCustomerOrders(
    customerId: string,
    query: ListOrdersQuery = {}
  ): Promise<MerchantOrderDto[]> {
    const filter: Record<string, unknown> = { customerId };
    if (query.status) {
      filter['status'] = query.status;
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const skip = Math.max(query.offset ?? 0, 0);

    const docs = await this.getOrdersCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return docs.map((d) => this.toOrderDto(d));
  }

  async getCustomerOrder(
    customerId: string,
    orderId: string
  ): Promise<MerchantOrderDto> {
    const order = await this.getOrdersCollection().findOne({ _id: orderId });
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.customerId !== customerId) {
      throw new ForbiddenError('You do not have access to this order');
    }
    return this.toOrderDto(order);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Merchant Order Queries (E13-T01) ──
  // ══════════════════════════════════════════════════════════════

  async listMerchantOrders(
    merchantUserId: string,
    storeId?: string,
    query: ListOrdersQuery = {}
  ): Promise<MerchantOrderDto[]> {
    const filter: Record<string, unknown> = { merchantUserId };
    if (storeId) {
      filter['storeId'] = storeId;
    }
    if (query.status) {
      filter['status'] = query.status;
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const skip = Math.max(query.offset ?? 0, 0);

    const docs = await this.getOrdersCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return docs.map((d) => this.toOrderDto(d));
  }

  async getMerchantOrder(
    merchantUserId: string,
    orderId: string
  ): Promise<MerchantOrderDto> {
    const order = await this.getOrdersCollection().findOne({ _id: orderId });
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }
    return this.toOrderDto(order);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Delivery Address Reveal (Non-cacheable & Audited) ──
  // ══════════════════════════════════════════════════════════════

  async revealDeliveryAddress(
    merchantUserId: string,
    orderId: string,
    requestId?: string
  ): Promise<DeliveryAddressSnapshot> {
    const order = await this.getOrdersCollection().findOne({ _id: orderId });
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (!order.addressConsentGranted) {
      throw new ConflictError('Delivery address sharing consent was not granted');
    }

    // Audited access event per spec
    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:address_revealed',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Merchant revealed delivery address for fulfillment',
      metadata: { orderNumber: order.orderNumber, storeId: order.storeId },
      requestId,
    });

    return order.deliveryAddressSnapshot;
  }

  // ══════════════════════════════════════════════════════════════
  // ── Merchant Order Lifecycle Commands (E13-T01 & E13-T02) ──
  // ══════════════════════════════════════════════════════════════

  async confirmOrder(
    merchantUserId: string,
    orderId: string,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'created' && order.status !== 'pending_confirmation') {
      throw new ConflictError(
        `Cannot confirm order with status "${order.status}". Only pending orders can be confirmed.`
      );
    }

    const now = new Date();

    // Commit inventory reservation if active
    await this.inventoryService.commitReservation(orderId);

    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'confirmed',
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:confirm',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Merchant accepted and confirmed order',
      metadata: { previousStatus: order.status, orderNumber: order.orderNumber },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async rejectOrder(
    merchantUserId: string,
    orderId: string,
    input: RejectOrderInput,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new ValidationError('A detailed reason is required to reject an order');
    }

    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'created' && order.status !== 'pending_confirmation') {
      throw new ConflictError(
        `Cannot reject order with status "${order.status}". Only pending orders can be rejected.`
      );
    }

    const now = new Date();

    // Release reservation if active
    await this.inventoryService.releaseReservation(orderId, input.reason.trim());

    // Restore stock if directly deducted at checkout
    await this.restoreOrderStock(order.items);

    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'rejected',
          rejectionInfo: {
            reason: input.reason.trim(),
            rejectedAt: now,
          },
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:reject',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: input.reason.trim(),
      metadata: { previousStatus: order.status, orderNumber: order.orderNumber },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async prepareOrder(
    merchantUserId: string,
    orderId: string,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'confirmed') {
      throw new ConflictError(
        `Cannot start preparation from status "${order.status}". Order must be confirmed first.`
      );
    }

    const now = new Date();
    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'preparing',
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:prepare',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Merchant began preparing order packages',
      metadata: { orderNumber: order.orderNumber },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async readyOrder(
    merchantUserId: string,
    orderId: string,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'preparing' && order.status !== 'in_preparation') {
      throw new ConflictError(
        `Cannot mark ready from status "${order.status}". Order must be in preparation.`
      );
    }

    const now = new Date();
    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'ready_for_delivery',
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:ready',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Merchant marked order packed and ready for courier pickup',
      metadata: { orderNumber: order.orderNumber },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async dispatchOrder(
    merchantUserId: string,
    orderId: string,
    input: DispatchOrderInput = {},
    requestId?: string
  ): Promise<MerchantOrderDto> {
    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'ready_for_delivery' && order.status !== 'ready') {
      throw new ConflictError(
        `Cannot dispatch order from status "${order.status}". Order must be ready for delivery first.`
      );
    }

    const now = new Date();
    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'out_for_delivery',
          dispatchInfo: {
            courierName: input.courierName?.trim(),
            trackingNumber: input.trackingNumber?.trim(),
            dispatchNotes: input.dispatchNotes?.trim(),
            dispatchedAt: now,
          },
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:dispatch',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Merchant handed package to courier for delivery',
      metadata: {
        courierName: input.courierName,
        trackingNumber: input.trackingNumber,
        orderNumber: order.orderNumber,
      },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async markDelivered(
    merchantUserId: string,
    orderId: string,
    input: MarkDeliveredInput,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    if (!input.proofNotes || input.proofNotes.trim().length < 3) {
      throw new ValidationError('Delivery proof notes are required (min 3 characters)');
    }

    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.merchantUserId !== merchantUserId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'out_for_delivery' && order.status !== 'dispatched') {
      throw new ConflictError(
        `Cannot mark delivered from status "${order.status}". Order must be out for delivery first.`
      );
    }

    const now = new Date();
    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'delivered',
          deliveryProof: {
            proofNotes: input.proofNotes.trim(),
            proofMediaRef: input.proofMediaRef?.trim(),
            deliveredAt: now,
          },
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: merchantUserId,
      action: 'merchant_order:mark_delivered',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Courier / Merchant marked package delivered with proof',
      metadata: { proofNotes: input.proofNotes, orderNumber: order.orderNumber },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async confirmCustomerDelivery(
    customerId: string,
    orderId: string,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');
    if (order.customerId !== customerId) {
      throw new ForbiddenError('You do not own this order');
    }

    if (order.status !== 'delivered') {
      throw new ConflictError(
        `Cannot confirm receipt of order with status "${order.status}". Order must be delivered first.`
      );
    }

    const now = new Date();
    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'completed',
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: customerId,
      action: 'merchant_order:confirm_delivery',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: 'Customer confirmed package receipt and completed order',
      metadata: { orderNumber: order.orderNumber },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  async cancelOrder(
    userId: string,
    isMerchant: boolean,
    orderId: string,
    input: CancelOrderInput,
    requestId?: string
  ): Promise<MerchantOrderDto> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new ValidationError('A detailed reason is required to cancel an order');
    }

    const ordersCol = this.getOrdersCollection();
    const order = await ordersCol.findOne({ _id: orderId });
    if (!order) throw new NotFoundError('Order not found');

    if (isMerchant && order.merchantUserId !== userId) {
      throw new ForbiddenError('You do not own this order');
    }
    if (!isMerchant && order.customerId !== userId) {
      throw new ForbiddenError('You do not own this order');
    }

    // Cancellation is allowed strictly prior to dispatch
    const preDispatchStatuses = [
      'created',
      'pending_confirmation',
      'confirmed',
      'preparing',
      'in_preparation',
      'ready',
      'ready_for_delivery',
    ];

    if (!preDispatchStatuses.includes(order.status)) {
      throw new ConflictError(
        `Cannot cancel order with status "${order.status}". Cancellation is not allowed after dispatch.`
      );
    }

    const now = new Date();

    // Release reservation if active
    await this.inventoryService.releaseReservation(orderId, input.reason.trim());

    // Restore stock to products
    await this.restoreOrderStock(order.items);

    const cancelledBy = isMerchant ? 'merchant' : 'customer';

    const updateRes = await ordersCol.updateOne(
      { _id: orderId, version: order.version },
      {
        $set: {
          status: 'cancelled',
          cancellationInfo: {
            reason: input.reason.trim(),
            cancelledBy,
            cancelledAt: now,
          },
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on order. Please retry.');
    }

    await this.auditService.log({
      actorId: userId,
      action: 'merchant_order:cancel',
      targetType: 'merchant_order',
      targetId: orderId,
      reason: input.reason.trim(),
      metadata: {
        cancelledBy,
        previousStatus: order.status,
        orderNumber: order.orderNumber,
      },
      requestId,
    });

    const updated = await ordersCol.findOne({ _id: orderId });
    return this.toOrderDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Helpers ──
  // ══════════════════════════════════════════════════════════════

  private async restoreOrderStock(
    items: Array<{ productId: string; quantity: number }>
  ): Promise<void> {
    const productsCol = this.getProductsCollection();
    for (const item of items) {
      await productsCol.updateOne(
        { _id: item.productId },
        {
          $inc: {
            stockQuantity: item.quantity,
            onHand: item.quantity,
          },
          $set: { updatedAt: new Date() },
        }
      );
    }
  }

  private toOrderDto(o: MerchantOrderDoc): MerchantOrderDto {
    return {
      id: o._id,
      orderNumber: o.orderNumber,
      storeId: o.storeId,
      customerId: o.customerId,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      codExpectedPiastres: o.codExpectedPiastres,
      items: o.items,
      subtotalPiastres: o.subtotalPiastres,
      deliveryFeePiastres: o.deliveryFeePiastres,
      totalPiastres: o.totalPiastres,
      deliveryAddressSnapshot: o.deliveryAddressSnapshot,
      addressConsentGranted: o.addressConsentGranted,
      notes: o.notes,
      dispatchInfo: o.dispatchInfo
        ? {
            ...o.dispatchInfo,
            dispatchedAt: o.dispatchInfo.dispatchedAt.toISOString(),
          }
        : undefined,
      deliveryProof: o.deliveryProof
        ? {
            ...o.deliveryProof,
            deliveredAt: o.deliveryProof.deliveredAt.toISOString(),
          }
        : undefined,
      cancellationInfo: o.cancellationInfo
        ? {
            ...o.cancellationInfo,
            cancelledAt: o.cancellationInfo.cancelledAt.toISOString(),
          }
        : undefined,
      rejectionInfo: o.rejectionInfo
        ? {
            ...o.rejectionInfo,
            rejectedAt: o.rejectionInfo.rejectedAt.toISOString(),
          }
        : undefined,
      version: o.version,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}

