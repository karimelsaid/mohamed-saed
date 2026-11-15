import { randomUUID, createHash } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  CartDoc,
  CartDto,
  CartItem,
  CustomerAddressDoc,
  CustomerAddressDto,
  DeliveryAddressSnapshot,
  MerchantOrderDoc,
  MerchantOrderDto,
  OrderItemSnapshot,
  CheckoutQuoteDto,
  IdempotencyClaimDoc,
} from './commerce.types.js';
import { ProductDoc, StoreDoc } from '../stores/stores.types.js';

export interface CreateAddressInput {
  label: string;
  governorateId: string;
  localityId?: string;
  addressText: string;
  building?: string;
  floor?: string;
  apartment?: string;
  phone: string;
  isDefault?: boolean;
}

export interface CheckoutInput {
  deliveryAddressId: string;
  consentToShareDeliveryAddress: boolean;
  paymentMethod: 'cash_on_delivery';
  notes?: string;
}

const STANDARD_DELIVERY_FEE_PIASTRES = 5000; // 50.00 EGP standard delivery fee

export class CommerceService {
  constructor(private auditService: AuditService) {}

  private getCartsCollection() {
    return getDb().collection<CartDoc>('carts');
  }

  private getAddressesCollection() {
    return getDb().collection<CustomerAddressDoc>('customer_addresses');
  }

  private getOrdersCollection() {
    return getDb().collection<MerchantOrderDoc>('merchant_orders');
  }

  private getIdempotencyCollection() {
    return getDb().collection<IdempotencyClaimDoc>('idempotency_claims');
  }

  // ══════════════════════════════════════════════════════════════
  // ── Address Operations ──
  // ══════════════════════════════════════════════════════════════

  async addAddress(customerId: string, input: CreateAddressInput): Promise<CustomerAddressDto> {
    const col = this.getAddressesCollection();
    const now = new Date();

    if (input.isDefault) {
      await col.updateMany({ customerId }, { $set: { isDefault: false } });
    }

    const doc: CustomerAddressDoc = {
      _id: randomUUID(),
      customerId,
      label: input.label.trim(),
      governorateId: input.governorateId,
      localityId: input.localityId,
      addressText: input.addressText.trim(),
      building: input.building?.trim(),
      floor: input.floor?.trim(),
      apartment: input.apartment?.trim(),
      phone: input.phone.trim(),
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(doc);
    return this.toAddressDto(doc);
  }

  async listAddresses(customerId: string): Promise<CustomerAddressDto[]> {
    const docs = await this.getAddressesCollection()
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map((d) => this.toAddressDto(d));
  }

  async getAddress(customerId: string, addressId: string): Promise<CustomerAddressDto> {
    const doc = await this.getAddressesCollection().findOne({ _id: addressId });
    if (!doc) throw new NotFoundError('Delivery address not found');
    if (doc.customerId !== customerId) throw new ForbiddenError('You do not own this address');
    return this.toAddressDto(doc);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Cart Operations (E11-T01) ──
  // ══════════════════════════════════════════════════════════════

  async getOrCreateCart(customerId: string): Promise<CartDto> {
    const col = this.getCartsCollection();
    let cart = await col.findOne({ customerId });

    if (!cart) {
      const now = new Date();
      cart = {
        _id: randomUUID(),
        customerId,
        activeStoreId: null,
        items: [],
        subtotalPiastres: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(cart);
      return this.toCartDto(cart);
    }

    // Server-recompute item prices and subtotal
    return this.recomputeAndSyncCart(cart);
  }

  async addItemToCart(
    customerId: string,
    input: { productId: string; quantity: number }
  ): Promise<CartDto> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new ValidationError('Quantity must be an integer >= 1');
    }

    const db = getDb();
    const product = await db.collection<ProductDoc>('products').findOne({ _id: input.productId });
    if (!product || product.status !== 'active') {
      throw new NotFoundError('Product not found or inactive');
    }

    const store = await db.collection<StoreDoc>('stores').findOne({ _id: product.storeId });
    if (!store || store.status !== 'active') {
      throw new ConflictError('Store is not active');
    }

    const col = this.getCartsCollection();
    let cart = await col.findOne({ customerId });
    const now = new Date();

    if (!cart) {
      cart = {
        _id: randomUUID(),
        customerId,
        activeStoreId: null,
        items: [],
        subtotalPiastres: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(cart);
    }

    // ── One-store-per-cart constraint (AC-E11.1) ──
    if (cart.activeStoreId !== null && cart.activeStoreId !== product.storeId) {
      throw new ConflictError(
        'Products from different stores cannot be combined in one cart. Switch store to continue.',
        'CART_STORE_MISMATCH'
      );
    }

    const existingIndex = cart.items.findIndex((i) => i.productId === product._id);
    const targetQuantity = existingIndex >= 0 ? cart.items[existingIndex].quantity + input.quantity : input.quantity;

    if (product.stockQuantity < targetQuantity) {
      throw new ConflictError(
        `Requested quantity (${targetQuantity}) exceeds available stock (${product.stockQuantity})`,
        'INSUFFICIENT_STOCK'
      );
    }

    const items = [...cart.items];
    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: targetQuantity,
        pricePiastres: product.price,
      };
    } else {
      items.push({
        productId: product._id,
        quantity: input.quantity,
        pricePiastres: product.price,
        titleAr: product.titleAr,
        titleEn: product.titleEn,
        sku: product.sku,
      });
    }

    const subtotal = items.reduce((acc, i) => acc + i.pricePiastres * i.quantity, 0);

    await col.updateOne(
      { _id: cart._id },
      {
        $set: {
          activeStoreId: product.storeId,
          items,
          subtotalPiastres: subtotal,
          updatedAt: now,
        },
        $inc: { version: 1 },
      }
    );

    const updated = await col.findOne({ _id: cart._id });
    return this.toCartDto(updated!, store.nameAr);
  }

  async updateItemQuantity(
    customerId: string,
    productId: string,
    quantity: number
  ): Promise<CartDto> {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ValidationError('Quantity must be an integer >= 0');
    }

    const col = this.getCartsCollection();
    const cart = await col.findOne({ customerId });
    if (!cart) throw new NotFoundError('Cart not found');

    if (quantity === 0) {
      return this.removeItem(customerId, productId);
    }

    const db = getDb();
    const product = await db.collection<ProductDoc>('products').findOne({ _id: productId });
    if (!product || product.status !== 'active') {
      throw new NotFoundError('Product not found or inactive');
    }

    if (product.stockQuantity < quantity) {
      throw new ConflictError(
        `Requested quantity (${quantity}) exceeds available stock (${product.stockQuantity})`,
        'INSUFFICIENT_STOCK'
      );
    }

    const items = cart.items.map((i) =>
      i.productId === productId ? { ...i, quantity, pricePiastres: product.price } : i
    );
    const subtotal = items.reduce((acc, i) => acc + i.pricePiastres * i.quantity, 0);

    await col.updateOne(
      { _id: cart._id },
      {
        $set: { items, subtotalPiastres: subtotal, updatedAt: new Date() },
        $inc: { version: 1 },
      }
    );

    const updated = await col.findOne({ _id: cart._id });
    return this.toCartDto(updated!);
  }

  async removeItem(customerId: string, productId: string): Promise<CartDto> {
    const col = this.getCartsCollection();
    const cart = await col.findOne({ customerId });
    if (!cart) throw new NotFoundError('Cart not found');

    const items = cart.items.filter((i) => i.productId !== productId);
    const activeStoreId = items.length === 0 ? null : cart.activeStoreId;
    const subtotal = items.reduce((acc, i) => acc + i.pricePiastres * i.quantity, 0);

    await col.updateOne(
      { _id: cart._id },
      {
        $set: {
          items,
          activeStoreId,
          subtotalPiastres: subtotal,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      }
    );

    const updated = await col.findOne({ _id: cart._id });
    return this.toCartDto(updated!);
  }

  async switchStore(
    customerId: string,
    input: { newStoreId: string; confirmSwitch: boolean; expectedVersion: number }
  ): Promise<CartDto> {
    const col = this.getCartsCollection();
    const cart = await col.findOne({ customerId });
    if (!cart) throw new NotFoundError('Cart not found');

    // Optimistic locking check
    if (cart.version !== input.expectedVersion) {
      throw new ConflictError('Stale cart version. Please refresh and try again.', 'STALE_VERSION');
    }

    // Require explicit confirmation
    if (!input.confirmSwitch) {
      throw new ValidationError('Explicit confirmation is required to switch store and clear cart');
    }

    const db = getDb();
    const store = await db.collection<StoreDoc>('stores').findOne({ _id: input.newStoreId });
    if (!store || store.status !== 'active') {
      throw new NotFoundError('New store not found or inactive');
    }

    await col.updateOne(
      { _id: cart._id, version: cart.version },
      {
        $set: {
          activeStoreId: input.newStoreId,
          items: [],
          subtotalPiastres: 0,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      }
    );

    const updated = await col.findOne({ _id: cart._id });
    return this.toCartDto(updated!, store.nameAr);
  }

  async clearCart(customerId: string): Promise<void> {
    await this.getCartsCollection().updateOne(
      { customerId },
      {
        $set: {
          items: [],
          activeStoreId: null,
          subtotalPiastres: 0,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      }
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ── Checkout & Quote Operations (E11-T02) ──
  // ══════════════════════════════════════════════════════════════

  async getCheckoutQuote(
    customerId: string,
    deliveryAddressId: string
  ): Promise<CheckoutQuoteDto> {
    const cart = await this.getCartsCollection().findOne({ customerId });
    if (!cart || cart.items.length === 0 || !cart.activeStoreId) {
      throw new ValidationError('Cart is empty. Add products before proceeding to checkout.');
    }

    const address = await this.getAddress(customerId, deliveryAddressId);
    const db = getDb();
    const store = await db.collection<StoreDoc>('stores').findOne({ _id: cart.activeStoreId });
    if (!store || store.status !== 'active') {
      throw new ConflictError('Store is not active');
    }

    // Revalidate all products and stock
    const itemSnapshots: OrderItemSnapshot[] = [];
    let subtotal = 0;

    for (const item of cart.items) {
      const product = await db.collection<ProductDoc>('products').findOne({ _id: item.productId });
      if (!product || product.status !== 'active') {
        throw new ConflictError(`Product "${item.titleAr}" is no longer available`);
      }
      if (product.stockQuantity < item.quantity) {
        throw new ConflictError(
          `Insufficient stock for "${product.titleAr}". Available: ${product.stockQuantity}`
        );
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;
      itemSnapshots.push({
        productId: product._id,
        titleAr: product.titleAr,
        titleEn: product.titleEn,
        sku: product.sku,
        unitPricePiastres: product.price,
        quantity: item.quantity,
        totalPiastres: itemTotal,
      });
    }

    const deliveryFee = STANDARD_DELIVERY_FEE_PIASTRES;
    const total = subtotal + deliveryFee;

    const addressSnapshot: DeliveryAddressSnapshot = {
      addressId: address.id,
      label: address.label,
      governorateId: address.governorateId,
      localityId: address.localityId,
      addressText: address.addressText,
      building: address.building,
      floor: address.floor,
      apartment: address.apartment,
      phone: address.phone,
    };

    return {
      storeId: store._id,
      storeNameAr: store.nameAr,
      items: itemSnapshots,
      subtotalPiastres: subtotal,
      deliveryFeePiastres: deliveryFee,
      totalPiastres: total,
      deliveryAddressSnapshot: addressSnapshot,
    };
  }

  async checkout(
    customerId: string,
    idempotencyKey: string,
    input: CheckoutInput,
    requestId?: string
  ): Promise<{ order: MerchantOrderDto; isReplay: boolean }> {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Idempotency-Key header is required for checkout');
    }

    // Compute request hash for idempotency checking
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ customerId, input }))
      .digest('hex');

    const idempotencyCol = this.getIdempotencyCollection();
    const existingClaim = await idempotencyCol.findOne({
      key: idempotencyKey,
      principalId: customerId,
      operation: 'checkout',
    });

    if (existingClaim) {
      if (existingClaim.requestHash === requestHash) {
        // Safe identical replay within retention schedule
        return {
          order: existingClaim.responseBody as unknown as MerchantOrderDto,
          isReplay: true,
        };
      } else {
        // Changed request payload using same key
        throw new ConflictError(
          'Idempotency key reused with different payload',
          'IDEMPOTENCY_KEY_REUSED'
        );
      }
    }

    // Explicit address sharing consent verification (API-SPECIFICATION Section 4)
    if (!input.consentToShareDeliveryAddress) {
      throw new ValidationError(
        'Explicit consent to share delivery address with merchant is required for delivery'
      );
    }

    if (input.paymentMethod !== 'cash_on_delivery') {
      throw new ValidationError('Only cash_on_delivery payment method is supported');
    }

    // Generate quote and validate inventory
    const quote = await this.getCheckoutQuote(customerId, input.deliveryAddressId);

    const db = getDb();
    const store = await db.collection<StoreDoc>('stores').findOne({ _id: quote.storeId });
    if (!store) throw new NotFoundError('Store not found');

    // Deduct stock atomically per product
    const productsCol = db.collection<ProductDoc>('products');
    const deductedProducts: Array<{ id: string; qty: number }> = [];

    for (const item of quote.items) {
      const res = await productsCol.updateOne(
        { _id: item.productId, stockQuantity: { $gte: item.quantity } },
        { $inc: { stockQuantity: -item.quantity } }
      );

      if (res.modifiedCount === 0) {
        // Rollback already deducted products
        for (const rolled of deductedProducts) {
          await productsCol.updateOne(
            { _id: rolled.id },
            { $inc: { stockQuantity: rolled.qty } }
          );
        }
        throw new ConflictError(
          `Insufficient stock during reservation for product: ${item.titleAr}`,
          'INSUFFICIENT_STOCK'
        );
      }
      deductedProducts.push({ id: item.productId, qty: item.quantity });
    }

    const now = new Date();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomSuffix}`;

    const orderDoc: MerchantOrderDoc = {
      _id: randomUUID(),
      orderNumber,
      storeId: quote.storeId,
      merchantUserId: store.merchantUserId,
      customerId,
      status: 'created',
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'pending',
      codExpectedPiastres: quote.totalPiastres,
      items: quote.items,
      subtotalPiastres: quote.subtotalPiastres,
      deliveryFeePiastres: quote.deliveryFeePiastres,
      totalPiastres: quote.totalPiastres,
      deliveryAddressSnapshot: quote.deliveryAddressSnapshot,
      addressConsentGranted: true,
      addressConsentGrantedAt: now,
      notes: input.notes?.trim(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.getOrdersCollection().insertOne(orderDoc);

    // Clear cart after checkout
    await this.clearCart(customerId);

    const orderDto = this.toOrderDto(orderDoc);

    // Store idempotency claim (expires in 30 days)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await idempotencyCol.insertOne({
      _id: randomUUID(),
      key: idempotencyKey,
      principalId: customerId,
      operation: 'checkout',
      requestHash,
      responseStatus: 201,
      responseBody: orderDto as unknown as Record<string, unknown>,
      createdAt: now,
      expiresAt,
    });

    await this.auditService.log({
      actorId: customerId,
      action: 'checkout:create_order',
      targetType: 'merchant_order',
      targetId: orderDoc._id,
      metadata: {
        storeId: quote.storeId,
        totalPiastres: quote.totalPiastres,
        itemsCount: quote.items.length,
      },
      requestId,
    });

    return { order: orderDto, isReplay: false };
  }

  // ══════════════════════════════════════════════════════════════
  // ── DTO Helpers ──
  // ══════════════════════════════════════════════════════════════

  private async recomputeAndSyncCart(cart: CartDoc): Promise<CartDto> {
    if (cart.items.length === 0) {
      return this.toCartDto(cart);
    }

    const db = getDb();
    const productIds = cart.items.map((i) => i.productId);
    const products = await db
      .collection<ProductDoc>('products')
      .find({ _id: { $in: productIds }, status: 'active' })
      .toArray();

    const productMap = new Map(products.map((p) => [p._id, p]));
    const validItems: CartItem[] = [];

    for (const item of cart.items) {
      const prod = productMap.get(item.productId);
      if (prod) {
        validItems.push({
          ...item,
          pricePiastres: prod.price,
          titleAr: prod.titleAr,
          titleEn: prod.titleEn,
          sku: prod.sku,
        });
      }
    }

    const subtotal = validItems.reduce((acc, i) => acc + i.pricePiastres * i.quantity, 0);

    await this.getCartsCollection().updateOne(
      { _id: cart._id },
      {
        $set: {
          items: validItems,
          subtotalPiastres: subtotal,
          updatedAt: new Date(),
        },
      }
    );

    const updated = await this.getCartsCollection().findOne({ _id: cart._id });
    return this.toCartDto(updated!);
  }

  private toCartDto(c: CartDoc, storeNameAr?: string): CartDto {
    const itemsCount = c.items.reduce((acc, i) => acc + i.quantity, 0);
    return {
      id: c._id,
      activeStoreId: c.activeStoreId,
      activeStoreNameAr: storeNameAr,
      items: c.items,
      subtotalPiastres: c.subtotalPiastres,
      itemsCount,
      version: c.version,
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  private toAddressDto(a: CustomerAddressDoc): CustomerAddressDto {
    return {
      id: a._id,
      label: a.label,
      governorateId: a.governorateId,
      localityId: a.localityId,
      addressText: a.addressText,
      building: a.building,
      floor: a.floor,
      apartment: a.apartment,
      phone: a.phone,
      isDefault: a.isDefault,
    };
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

