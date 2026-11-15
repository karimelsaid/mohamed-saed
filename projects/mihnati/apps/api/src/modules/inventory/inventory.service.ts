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
  InventoryMovementDoc,
  InventoryMovementDto,
  InventoryReservationDoc,
  InventoryReservationDto,
  StockProjectionDto,
} from './inventory.types.js';
import { ProductDoc } from '../stores/stores.types.js';

export interface InventoryAdjustmentInput {
  type: 'restock' | 'damage' | 'shrinkage' | 'audit_correction';
  quantity: number;
  reason: string;
}

export class InventoryService {
  constructor(private auditService: AuditService) {}

  private getMovementsCollection() {
    return getDb().collection<InventoryMovementDoc>('inventory_movements');
  }

  private getReservationsCollection() {
    return getDb().collection<InventoryReservationDoc>('inventory_reservations');
  }

  private getProductsCollection() {
    return getDb().collection<ProductDoc>('products');
  }

  // ══════════════════════════════════════════════════════════════
  // ── Stock Projection & Reconciliation (E12-T01) ──
  // ══════════════════════════════════════════════════════════════

  async getStockProjection(productId: string): Promise<StockProjectionDto> {
    const product = await this.getProductsCollection().findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');

    const onHand = product.onHand ?? product.stockQuantity ?? 0;
    const reserved = product.reserved ?? 0;
    const available = Math.max(0, onHand - reserved);

    return {
      productId: product._id,
      onHand,
      reserved,
      available,
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  async adjustInventory(
    userId: string,
    productId: string,
    input: InventoryAdjustmentInput,
    requestId?: string
  ): Promise<StockProjectionDto> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new ValidationError('A detailed reason is required for inventory adjustments');
    }

    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) {
      throw new ForbiddenError('You do not own this product');
    }

    let delta = 0;
    if (input.type === 'restock') {
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        throw new ValidationError('Restock quantity must be a positive integer');
      }
      delta = input.quantity;
    } else if (input.type === 'damage' || input.type === 'shrinkage') {
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        throw new ValidationError('Damage/shrinkage quantity must be a positive integer');
      }
      delta = -input.quantity;
    } else if (input.type === 'audit_correction') {
      if (!Number.isInteger(input.quantity)) {
        throw new ValidationError('Audit correction quantity must be an integer');
      }
      delta = input.quantity;
    }

    const currentOnHand = product.onHand ?? product.stockQuantity ?? 0;
    const currentReserved = product.reserved ?? 0;
    const targetOnHand = currentOnHand + delta;

    // Invariant: available = onHand - reserved, never negative
    if (targetOnHand < currentReserved) {
      throw new ValidationError(
        `Adjustment would cause available stock to become negative (OnHand: ${targetOnHand}, Reserved: ${currentReserved})`
      );
    }

    const now = new Date();
    const newStockQuantity = targetOnHand - currentReserved;

    // Atomic conditional update
    const updateRes = await productsCol.updateOne(
      {
        _id: productId,
        version: product.version,
      },
      {
        $set: {
          onHand: targetOnHand,
          reserved: currentReserved,
          stockQuantity: newStockQuantity,
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    if (updateRes.modifiedCount === 0) {
      throw new ConflictError('Concurrent edit detected on product inventory. Please retry.');
    }

    // Append to immutable movements ledger
    const movementDoc: InventoryMovementDoc = {
      _id: randomUUID(),
      productId,
      storeId: product.storeId,
      merchantUserId: userId,
      type: input.type,
      quantityDelta: delta,
      reason: input.reason.trim(),
      previousOnHand: currentOnHand,
      newOnHand: targetOnHand,
      previousReserved: currentReserved,
      newReserved: currentReserved,
      createdAt: now,
    };
    await this.getMovementsCollection().insertOne(movementDoc);

    await this.auditService.log({
      actorId: userId,
      action: 'inventory:adjust',
      targetType: 'product',
      targetId: productId,
      reason: input.reason.trim(),
      metadata: {
        adjustmentType: input.type,
        delta,
        previousOnHand: currentOnHand,
        newOnHand: targetOnHand,
      },
      requestId,
    });

    return {
      productId,
      onHand: targetOnHand,
      reserved: currentReserved,
      available: newStockQuantity,
      updatedAt: now.toISOString(),
    };
  }

  async listMovements(userId: string, productId: string): Promise<InventoryMovementDto[]> {
    const product = await this.getProductsCollection().findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) {
      throw new ForbiddenError('You do not own this product');
    }

    const docs = await this.getMovementsCollection()
      .find({ productId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((d) => ({
      id: d._id,
      productId: d.productId,
      storeId: d.storeId,
      type: d.type,
      quantityDelta: d.quantityDelta,
      reason: d.reason,
      referenceId: d.referenceId,
      onHand: d.newOnHand,
      reserved: d.newReserved,
      available: Math.max(0, d.newOnHand - d.newReserved),
      createdAt: d.createdAt.toISOString(),
    }));
  }

  // ══════════════════════════════════════════════════════════════
  // ── Reservation Lifecycle & CAS Worker (E12-T02) ──
  // ══════════════════════════════════════════════════════════════

  async createReservations(
    orderId: string,
    storeId: string,
    items: Array<{ productId: string; quantity: number }>,
    holdMinutes = 30
  ): Promise<InventoryReservationDto[]> {
    const productsCol = this.getProductsCollection();
    const reservedProducts: Array<{ id: string; qty: number }> = [];
    const reservations: InventoryReservationDoc[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000);

    for (const item of items) {
      // Find product and ensure available >= item.quantity
      const prod = await productsCol.findOne({ _id: item.productId });
      if (!prod || prod.status !== 'active') {
        await this.rollbackReservedStock(reservedProducts);
        throw new ConflictError(`Product is no longer active`);
      }

      const onHand = prod.onHand ?? prod.stockQuantity ?? 0;
      const reserved = prod.reserved ?? 0;

      if (onHand - reserved < item.quantity) {
        await this.rollbackReservedStock(reservedProducts);
        throw new ConflictError(
          `Insufficient stock for reservation: ${prod.titleAr}`,
          'INSUFFICIENT_STOCK'
        );
      }

      // Atomically increment reserved and decrement stockQuantity
      const updateRes = await productsCol.updateOne(
        {
          _id: item.productId,
          stockQuantity: { $gte: item.quantity },
        },
        {
          $inc: {
            reserved: item.quantity,
            stockQuantity: -item.quantity,
          },
          $set: {
            onHand: onHand, // ensure onHand is persisted
            updatedAt: now,
          },
        }
      );

      if (updateRes.modifiedCount === 0) {
        await this.rollbackReservedStock(reservedProducts);
        throw new ConflictError(
          `Stock race occurred during reservation for product: ${prod.titleAr}`,
          'INSUFFICIENT_STOCK'
        );
      }

      reservedProducts.push({ id: item.productId, qty: item.quantity });

      const reservationDoc: InventoryReservationDoc = {
        _id: randomUUID(),
        orderId,
        productId: item.productId,
        storeId,
        quantity: item.quantity,
        status: 'active',
        expiresAt,
        createdAt: now,
        updatedAt: now,
      };
      reservations.push(reservationDoc);

      // Append 'reserved' movement
      await this.getMovementsCollection().insertOne({
        _id: randomUUID(),
        productId: item.productId,
        storeId,
        type: 'reserved',
        quantityDelta: item.quantity,
        reason: `Checkout reservation for order: ${orderId}`,
        referenceId: orderId,
        previousOnHand: onHand,
        newOnHand: onHand,
        previousReserved: reserved,
        newReserved: reserved + item.quantity,
        createdAt: now,
      });
    }

    await this.getReservationsCollection().insertMany(reservations);
    return reservations.map((r) => this.toReservationDto(r));
  }

  async commitReservation(orderId: string): Promise<void> {
    const reservationsCol = this.getReservationsCollection();
    const activeReservations = await reservationsCol
      .find({ orderId, status: 'active' })
      .toArray();

    if (activeReservations.length === 0) {
      return; // No active reservations or already committed
    }

    const productsCol = this.getProductsCollection();
    const movementsCol = this.getMovementsCollection();
    const now = new Date();

    for (const res of activeReservations) {
      // CAS transition status from 'active' to 'committed'
      const updateRes = await reservationsCol.updateOne(
        { _id: res._id, status: 'active' },
        { $set: { status: 'committed', updatedAt: now } }
      );

      if (updateRes.modifiedCount === 1) {
        // Deduct both onHand and reserved
        await productsCol.updateOne(
          { _id: res.productId },
          {
            $inc: {
              onHand: -res.quantity,
              reserved: -res.quantity,
            },
            $set: { updatedAt: now },
          }
        );

        const prod = await productsCol.findOne({ _id: res.productId });
        const onHand = prod?.onHand ?? 0;
        const reserved = prod?.reserved ?? 0;

        await movementsCol.insertOne({
          _id: randomUUID(),
          productId: res.productId,
          storeId: res.storeId,
          type: 'committed',
          quantityDelta: -res.quantity,
          reason: `Order confirmed: ${orderId}`,
          referenceId: orderId,
          previousOnHand: onHand + res.quantity,
          newOnHand: onHand,
          previousReserved: reserved + res.quantity,
          newReserved: reserved,
          createdAt: now,
        });
      }
    }
  }

  async releaseReservation(orderId: string, reason = 'Order cancelled'): Promise<void> {
    const reservationsCol = this.getReservationsCollection();
    const activeReservations = await reservationsCol
      .find({ orderId, status: 'active' })
      .toArray();

    if (activeReservations.length === 0) return;

    const productsCol = this.getProductsCollection();
    const movementsCol = this.getMovementsCollection();
    const now = new Date();

    for (const res of activeReservations) {
      const updateRes = await reservationsCol.updateOne(
        { _id: res._id, status: 'active' },
        { $set: { status: 'released', updatedAt: now } }
      );

      if (updateRes.modifiedCount === 1) {
        await productsCol.updateOne(
          { _id: res.productId },
          {
            $inc: {
              reserved: -res.quantity,
              stockQuantity: res.quantity,
            },
            $set: { updatedAt: now },
          }
        );

        const prod = await productsCol.findOne({ _id: res.productId });
        const onHand = prod?.onHand ?? 0;
        const reserved = prod?.reserved ?? 0;

        await movementsCol.insertOne({
          _id: randomUUID(),
          productId: res.productId,
          storeId: res.storeId,
          type: 'released',
          quantityDelta: -res.quantity,
          reason,
          referenceId: orderId,
          previousOnHand: onHand,
          newOnHand: onHand,
          previousReserved: reserved + res.quantity,
          newReserved: reserved,
          createdAt: now,
        });
      }
    }
  }

  /**
   * Expire stale reservations whose hold duration has elapsed (CAS Worker).
   * Releases stock atomically and appends to movements ledger.
   */
  async expireStaleReservations(): Promise<number> {
    const reservationsCol = this.getReservationsCollection();
    const now = new Date();

    const stale = await reservationsCol
      .find({
        status: 'active',
        expiresAt: { $lt: now },
      })
      .toArray();

    let expiredCount = 0;
    const productsCol = this.getProductsCollection();
    const movementsCol = this.getMovementsCollection();

    for (const res of stale) {
      // Atomic CAS update
      const updateRes = await reservationsCol.updateOne(
        { _id: res._id, status: 'active' },
        { $set: { status: 'expired', updatedAt: now } }
      );

      if (updateRes.modifiedCount === 1) {
        expiredCount++;

        // Release reserved count back to available
        await productsCol.updateOne(
          { _id: res.productId },
          {
            $inc: {
              reserved: -res.quantity,
              stockQuantity: res.quantity,
            },
            $set: { updatedAt: now },
          }
        );

        const prod = await productsCol.findOne({ _id: res.productId });
        const onHand = prod?.onHand ?? 0;
        const reserved = prod?.reserved ?? 0;

        await movementsCol.insertOne({
          _id: randomUUID(),
          productId: res.productId,
          storeId: res.storeId,
          type: 'released',
          quantityDelta: -res.quantity,
          reason: `Reservation expired by CAS worker for order: ${res.orderId}`,
          referenceId: res.orderId,
          previousOnHand: onHand,
          newOnHand: onHand,
          previousReserved: reserved + res.quantity,
          newReserved: reserved,
          createdAt: now,
        });
      }
    }

    return expiredCount;
  }

  // ══════════════════════════════════════════════════════════════
  // ── Helpers ──
  // ══════════════════════════════════════════════════════════════

  private async rollbackReservedStock(
    reserved: Array<{ id: string; qty: number }>
  ): Promise<void> {
    const productsCol = this.getProductsCollection();
    for (const item of reserved) {
      await productsCol.updateOne(
        { _id: item.id },
        {
          $inc: {
            reserved: -item.qty,
            stockQuantity: item.qty,
          },
        }
      );
    }
  }

  private toReservationDto(r: InventoryReservationDoc): InventoryReservationDto {
    return {
      id: r._id,
      orderId: r.orderId,
      productId: r.productId,
      storeId: r.storeId,
      quantity: r.quantity,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  }
}

