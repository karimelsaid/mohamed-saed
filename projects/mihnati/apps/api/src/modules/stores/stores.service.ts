import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import { VerificationService } from '../verification/verification.service.js';
import {
  StoreDoc,
  StoreDto,
  PublicStoreDto,
  ProductDoc,
  ProductDto,
  PublicProductDto,
  StoreStatus,
  ProductStatus,
} from './stores.types.js';
import { MerchantProfileDoc } from '../roles/role.types.js';
import { GovernorateDoc } from '../geography/geography.types.js';
import { CategoryDoc } from '../taxonomy/taxonomy.types.js';

export interface CreateStoreInput {
  nameAr: string;
  nameEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  governorateId: string;
  localityId?: string;
  categories: string[];
  logoMediaId?: string;
  bannerMediaId?: string;
}

export interface UpdateStoreInput {
  nameAr?: string;
  nameEn?: string;
  slug?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  governorateId?: string;
  localityId?: string;
  categories?: string[];
  logoMediaId?: string;
  bannerMediaId?: string;
}

export interface CreateProductInput {
  titleAr: string;
  titleEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  categoryId: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity?: number;
  mediaIds?: string[];
}

export interface UpdateProductInput {
  titleAr?: string;
  titleEn?: string;
  slug?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  categoryId?: string;
  sku?: string;
  price?: number;
  compareAtPrice?: number;
  stockQuantity?: number;
  mediaIds?: string[];
}

export interface ListProductsQuery {
  status?: ProductStatus;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPublicProductsQuery {
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminListStoresQuery {
  status?: StoreStatus;
  page?: number;
  pageSize?: number;
}

export interface AdminListProductsQuery {
  status?: ProductStatus;
  storeId?: string;
  page?: number;
  pageSize?: number;
}

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064A]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class StoresService {
  constructor(
    private auditService: AuditService,
    private verificationService: VerificationService
  ) {}

  private getStoresCollection() {
    return getDb().collection<StoreDoc>('stores');
  }

  private getProductsCollection() {
    return getDb().collection<ProductDoc>('products');
  }

  // ══════════════════════════════════════════════════════════════
  // ── Store Operations (Merchant Self) ──
  // ══════════════════════════════════════════════════════════════

  async createStoreDraft(userId: string, input: CreateStoreInput): Promise<StoreDto> {
    const db = getDb();
    const merchant = await db
      .collection<MerchantProfileDoc>('merchant_profiles')
      .findOne({ userId });

    if (!merchant) {
      throw new ValidationError('Merchant profile required to create a store');
    }

    const storesCol = this.getStoresCollection();

    // Enforce one-store constraint in MVP
    const existingStore = await storesCol.findOne({ merchantProfileId: merchant._id });
    if (existingStore) {
      throw new ConflictError('Merchant can only have one store in MVP');
    }

    const cleanSlug = normalizeSlug(input.slug);
    if (!cleanSlug) {
      throw new ValidationError('Valid store slug is required');
    }

    const existingSlug = await storesCol.findOne({ slug: cleanSlug });
    if (existingSlug) {
      throw new ConflictError('Store slug already in use');
    }

    // Validate governorate
    const gov = await db
      .collection<GovernorateDoc>('governorates')
      .findOne({ _id: input.governorateId });
    if (!gov) {
      throw new ValidationError('Invalid governorate ID');
    }

    // Validate categories exist and are product type
    if (!input.categories || input.categories.length === 0) {
      throw new ValidationError('At least one product category is required');
    }

    const categoriesCount = await db.collection<CategoryDoc>('categories').countDocuments({
      _id: { $in: input.categories },
      type: 'product',
      status: 'active',
    });

    if (categoriesCount !== input.categories.length) {
      throw new ValidationError('One or more product categories are invalid or inactive');
    }

    const now = new Date();
    const storeDoc: StoreDoc = {
      _id: randomUUID(),
      merchantProfileId: merchant._id,
      merchantUserId: userId,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      slug: cleanSlug,
      descriptionAr: input.descriptionAr?.trim(),
      descriptionEn: input.descriptionEn?.trim(),
      governorateId: input.governorateId,
      localityId: input.localityId,
      categories: input.categories,
      logoMediaId: input.logoMediaId,
      bannerMediaId: input.bannerMediaId,
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await storesCol.insertOne(storeDoc);
    return this.toStoreDto(storeDoc);
  }

  async getOwnStore(userId: string): Promise<StoreDto> {
    const store = await this.getStoresCollection().findOne({ merchantUserId: userId });
    if (!store) {
      throw new NotFoundError('Store not found');
    }
    return this.toStoreDto(store);
  }

  async updateOwnStore(userId: string, input: UpdateStoreInput): Promise<StoreDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ merchantUserId: userId });
    if (!store) {
      throw new NotFoundError('Store not found');
    }

    if (store.status === 'suspended') {
      throw new ForbiddenError('Suspended store cannot be edited directly');
    }

    const updates: Partial<StoreDoc> = {
      updatedAt: new Date(),
      version: store.version + 1,
    };

    if (input.nameAr !== undefined) updates.nameAr = input.nameAr.trim();
    if (input.nameEn !== undefined) updates.nameEn = input.nameEn.trim();
    if (input.descriptionAr !== undefined) updates.descriptionAr = input.descriptionAr.trim();
    if (input.descriptionEn !== undefined) updates.descriptionEn = input.descriptionEn.trim();
    if (input.governorateId !== undefined) updates.governorateId = input.governorateId;
    if (input.localityId !== undefined) updates.localityId = input.localityId;
    if (input.logoMediaId !== undefined) updates.logoMediaId = input.logoMediaId;
    if (input.bannerMediaId !== undefined) updates.bannerMediaId = input.bannerMediaId;

    if (input.slug !== undefined) {
      const cleanSlug = normalizeSlug(input.slug);
      if (!cleanSlug) throw new ValidationError('Invalid slug');
      if (cleanSlug !== store.slug) {
        const slugExists = await storesCol.findOne({ slug: cleanSlug });
        if (slugExists) throw new ConflictError('Store slug already in use');
        updates.slug = cleanSlug;
      }
    }

    if (input.categories !== undefined) {
      if (input.categories.length === 0) {
        throw new ValidationError('At least one product category is required');
      }
      const db = getDb();
      const count = await db.collection<CategoryDoc>('categories').countDocuments({
        _id: { $in: input.categories },
        type: 'product',
        status: 'active',
      });
      if (count !== input.categories.length) {
        throw new ValidationError('One or more product categories are invalid or inactive');
      }
      updates.categories = input.categories;
    }

    await storesCol.updateOne({ _id: store._id }, { $set: updates });
    const updated = await storesCol.findOne({ _id: store._id });
    return this.toStoreDto(updated!);
  }

  async submitStoreForApproval(userId: string): Promise<StoreDto> {
    // Enforce verified merchant eligibility
    await this.verificationService.assertVerifiedMerchant(userId);

    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ merchantUserId: userId });
    if (!store) {
      throw new NotFoundError('Store not found');
    }

    if (store.status !== 'draft' && store.status !== 'rejected') {
      throw new ConflictError(`Cannot submit store in status: ${store.status}`);
    }

    const now = new Date();
    await storesCol.updateOne(
      { _id: store._id },
      {
        $set: {
          status: 'pending_approval',
          rejectionReason: undefined,
          updatedAt: now,
          version: store.version + 1,
        },
      }
    );

    const updated = await storesCol.findOne({ _id: store._id });
    return this.toStoreDto(updated!);
  }

  async pauseOwnStore(userId: string): Promise<StoreDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ merchantUserId: userId });
    if (!store) throw new NotFoundError('Store not found');
    if (store.status !== 'active') {
      throw new ConflictError('Only active stores can be paused');
    }

    await storesCol.updateOne(
      { _id: store._id },
      { $set: { status: 'suspended', suspensionReason: 'Paused by merchant', updatedAt: new Date() } }
    );
    const updated = await storesCol.findOne({ _id: store._id });
    return this.toStoreDto(updated!);
  }

  async resumeOwnStore(userId: string): Promise<StoreDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ merchantUserId: userId });
    if (!store) throw new NotFoundError('Store not found');
    if (store.status !== 'suspended') {
      throw new ConflictError('Only suspended stores can be resumed');
    }

    await storesCol.updateOne(
      { _id: store._id },
      { $set: { status: 'active', suspensionReason: undefined, updatedAt: new Date() } }
    );
    const updated = await storesCol.findOne({ _id: store._id });
    return this.toStoreDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Public Store Views ──
  // ══════════════════════════════════════════════════════════════

  async getPublicStoreBySlug(slug: string): Promise<PublicStoreDto> {
    const cleanSlug = normalizeSlug(slug);
    const store = await this.getStoresCollection().findOne({
      slug: cleanSlug,
      status: 'active',
    });

    if (!store) {
      throw new NotFoundError('Store not found or inactive');
    }

    return {
      nameAr: store.nameAr,
      nameEn: store.nameEn,
      slug: store.slug,
      descriptionAr: store.descriptionAr,
      descriptionEn: store.descriptionEn,
      governorateId: store.governorateId,
      localityId: store.localityId,
      categories: store.categories,
      logoMediaId: store.logoMediaId,
      bannerMediaId: store.bannerMediaId,
      status: 'active',
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── Product Operations (Merchant Self) ──
  // ══════════════════════════════════════════════════════════════

  async createProductDraft(userId: string, input: CreateProductInput): Promise<ProductDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ merchantUserId: userId });
    if (!store) {
      throw new ForbiddenError('You must create a store before adding products');
    }

    // Validate category
    const db = getDb();
    const category = await db.collection<CategoryDoc>('categories').findOne({
      _id: input.categoryId,
      type: 'product',
      status: 'active',
    });
    if (!category) {
      throw new ValidationError('Invalid or inactive product category');
    }

    // Validate price
    if (!Number.isInteger(input.price) || input.price < 0) {
      throw new ValidationError('Product price must be a non-negative integer in piastres');
    }

    if (input.compareAtPrice !== undefined) {
      if (!Number.isInteger(input.compareAtPrice) || input.compareAtPrice < 0) {
        throw new ValidationError('compareAtPrice must be a non-negative integer in piastres');
      }
    }

    // Validate SKU uniqueness within this store
    const productsCol = this.getProductsCollection();
    const existingSku = await productsCol.findOne({
      storeId: store._id,
      sku: input.sku.trim(),
    });
    if (existingSku) {
      throw new ConflictError('SKU already exists in this store');
    }

    const cleanSlug = normalizeSlug(input.slug);
    const now = new Date();
    const productDoc: ProductDoc = {
      _id: randomUUID(),
      storeId: store._id,
      merchantUserId: userId,
      titleAr: input.titleAr.trim(),
      titleEn: input.titleEn.trim(),
      slug: cleanSlug,
      descriptionAr: input.descriptionAr?.trim(),
      descriptionEn: input.descriptionEn?.trim(),
      categoryId: input.categoryId,
      sku: input.sku.trim(),
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      stockQuantity: input.stockQuantity ?? 0,
      mediaIds: input.mediaIds ?? [],
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await productsCol.insertOne(productDoc);
    return this.toProductDto(productDoc);
  }

  async listOwnProducts(
    userId: string,
    query: ListProductsQuery
  ): Promise<{ data: ProductDto[]; total: number }> {
    const store = await this.getStoresCollection().findOne({ merchantUserId: userId });
    if (!store) {
      return { data: [], total: 0 };
    }

    const filter: Record<string, unknown> = { storeId: store._id };
    if (query.status) filter.status = query.status;
    if (query.categoryId) filter.categoryId = query.categoryId;

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const productsCol = this.getProductsCollection();
    const [docs, total] = await Promise.all([
      productsCol.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      productsCol.countDocuments(filter),
    ]);

    return {
      data: docs.map((d) => this.toProductDto(d)),
      total,
    };
  }

  async getOwnProduct(userId: string, productId: string): Promise<ProductDto> {
    const product = await this.getProductsCollection().findOne({ _id: productId });
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    if (product.merchantUserId !== userId) {
      throw new ForbiddenError('You do not own this product');
    }
    return this.toProductDto(product);
  }

  async updateProductDraft(
    userId: string,
    productId: string,
    input: UpdateProductInput
  ): Promise<ProductDto> {
    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) throw new ForbiddenError('You do not own this product');

    if (product.status !== 'draft' && product.status !== 'rejected' && product.status !== 'paused') {
      throw new ConflictError(`Cannot edit product in status "${product.status}". Pause it first if active.`);
    }

    const updates: Partial<ProductDoc> = {
      updatedAt: new Date(),
      version: product.version + 1,
    };

    if (input.titleAr !== undefined) updates.titleAr = input.titleAr.trim();
    if (input.titleEn !== undefined) updates.titleEn = input.titleEn.trim();
    if (input.slug !== undefined) updates.slug = normalizeSlug(input.slug);
    if (input.descriptionAr !== undefined) updates.descriptionAr = input.descriptionAr.trim();
    if (input.descriptionEn !== undefined) updates.descriptionEn = input.descriptionEn.trim();
    if (input.mediaIds !== undefined) updates.mediaIds = input.mediaIds;

    if (input.price !== undefined) {
      if (!Number.isInteger(input.price) || input.price < 0) {
        throw new ValidationError('Price must be a non-negative integer in piastres');
      }
      updates.price = input.price;
    }

    if (input.compareAtPrice !== undefined) {
      if (!Number.isInteger(input.compareAtPrice) || input.compareAtPrice < 0) {
        throw new ValidationError('compareAtPrice must be a non-negative integer in piastres');
      }
      updates.compareAtPrice = input.compareAtPrice;
    }

    if (input.stockQuantity !== undefined) {
      if (!Number.isInteger(input.stockQuantity) || input.stockQuantity < 0) {
        throw new ValidationError('Stock quantity must be a non-negative integer');
      }
      updates.stockQuantity = input.stockQuantity;
    }

    if (input.sku !== undefined && input.sku.trim() !== product.sku) {
      const existingSku = await productsCol.findOne({
        storeId: product.storeId,
        sku: input.sku.trim(),
      });
      if (existingSku) throw new ConflictError('SKU already exists in this store');
      updates.sku = input.sku.trim();
    }

    if (input.categoryId !== undefined) {
      const db = getDb();
      const cat = await db.collection<CategoryDoc>('categories').findOne({
        _id: input.categoryId,
        type: 'product',
        status: 'active',
      });
      if (!cat) throw new ValidationError('Invalid or inactive product category');
      updates.categoryId = input.categoryId;
    }

    await productsCol.updateOne({ _id: productId }, { $set: updates });
    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  async submitProductForReview(userId: string, productId: string): Promise<ProductDto> {
    // Enforce verified merchant
    await this.verificationService.assertVerifiedMerchant(userId);

    const store = await this.getStoresCollection().findOne({ merchantUserId: userId });
    if (!store || store.status !== 'active') {
      throw new ConflictError('Store must be active to submit products for review');
    }

    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) throw new ForbiddenError('You do not own this product');

    if (product.status !== 'draft' && product.status !== 'rejected') {
      throw new ConflictError(`Cannot submit product in status: ${product.status}`);
    }

    const now = new Date();
    await productsCol.updateOne(
      { _id: productId },
      {
        $set: {
          status: 'pending_approval',
          rejectionReason: undefined,
          updatedAt: now,
          version: product.version + 1,
        },
      }
    );

    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  async pauseProduct(userId: string, productId: string): Promise<ProductDto> {
    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) throw new ForbiddenError('You do not own this product');
    if (product.status !== 'active') {
      throw new ConflictError('Only active products can be paused');
    }

    await productsCol.updateOne(
      { _id: productId },
      { $set: { status: 'paused', updatedAt: new Date() } }
    );
    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  async resumeProduct(userId: string, productId: string): Promise<ProductDto> {
    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) throw new ForbiddenError('You do not own this product');
    if (product.status !== 'paused') {
      throw new ConflictError('Only paused products can be resumed');
    }

    await productsCol.updateOne(
      { _id: productId },
      { $set: { status: 'active', updatedAt: new Date() } }
    );
    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  async archiveProduct(userId: string, productId: string): Promise<ProductDto> {
    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');
    if (product.merchantUserId !== userId) throw new ForbiddenError('You do not own this product');

    await productsCol.updateOne(
      { _id: productId },
      { $set: { status: 'archived', updatedAt: new Date() } }
    );
    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Public Product Views ──
  // ══════════════════════════════════════════════════════════════

  async listPublicStoreProducts(
    storeSlug: string,
    query: ListPublicProductsQuery
  ): Promise<{ data: PublicProductDto[]; total: number }> {
    const cleanSlug = normalizeSlug(storeSlug);
    const store = await this.getStoresCollection().findOne({
      slug: cleanSlug,
      status: 'active',
    });

    if (!store) {
      throw new NotFoundError('Store not found or inactive');
    }

    const filter: Record<string, unknown> = {
      storeId: store._id,
      status: 'active',
    };
    if (query.categoryId) filter.categoryId = query.categoryId;

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const productsCol = this.getProductsCollection();
    const [docs, total] = await Promise.all([
      productsCol.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      productsCol.countDocuments(filter),
    ]);

    return {
      data: docs.map((d) => this.toPublicProductDto(d, store.slug)),
      total,
    };
  }

  async getPublicProduct(productId: string): Promise<PublicProductDto> {
    const product = await this.getProductsCollection().findOne({
      _id: productId,
      status: 'active',
    });
    if (!product) {
      throw new NotFoundError('Product not found or inactive');
    }

    const store = await this.getStoresCollection().findOne({
      _id: product.storeId,
      status: 'active',
    });
    if (!store) {
      throw new NotFoundError('Store not found or inactive');
    }

    return this.toPublicProductDto(product, store.slug);
  }

  // ══════════════════════════════════════════════════════════════
  // ── Admin Moderation ──
  // ══════════════════════════════════════════════════════════════

  async listAdminStores(
    query: AdminListStoresQuery
  ): Promise<{ data: StoreDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const storesCol = this.getStoresCollection();
    const [docs, total] = await Promise.all([
      storesCol.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      storesCol.countDocuments(filter),
    ]);

    return {
      data: docs.map((d) => this.toStoreDto(d)),
      total,
    };
  }

  async adminApproveStore(
    adminId: string,
    storeId: string,
    requestId?: string
  ): Promise<StoreDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ _id: storeId });
    if (!store) throw new NotFoundError('Store not found');

    const now = new Date();
    await storesCol.updateOne(
      { _id: storeId },
      {
        $set: {
          status: 'active',
          rejectionReason: undefined,
          suspensionReason: undefined,
          updatedAt: now,
          version: store.version + 1,
        },
      }
    );

    await this.auditService.log({
      actorId: adminId,
      action: 'store:approve',
      targetType: 'store',
      targetId: storeId,
      requestId,
    });

    const updated = await storesCol.findOne({ _id: storeId });
    return this.toStoreDto(updated!);
  }

  async adminRejectStore(
    adminId: string,
    storeId: string,
    reason: string,
    requestId?: string
  ): Promise<StoreDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ _id: storeId });
    if (!store) throw new NotFoundError('Store not found');

    const now = new Date();
    await storesCol.updateOne(
      { _id: storeId },
      {
        $set: {
          status: 'rejected',
          rejectionReason: reason.trim(),
          updatedAt: now,
          version: store.version + 1,
        },
      }
    );

    await this.auditService.log({
      actorId: adminId,
      action: 'store:reject',
      targetType: 'store',
      targetId: storeId,
      reason,
      requestId,
    });

    const updated = await storesCol.findOne({ _id: storeId });
    return this.toStoreDto(updated!);
  }

  async adminSuspendStore(
    adminId: string,
    storeId: string,
    reason: string,
    requestId?: string
  ): Promise<StoreDto> {
    const storesCol = this.getStoresCollection();
    const store = await storesCol.findOne({ _id: storeId });
    if (!store) throw new NotFoundError('Store not found');

    const now = new Date();
    await storesCol.updateOne(
      { _id: storeId },
      {
        $set: {
          status: 'suspended',
          suspensionReason: reason.trim(),
          updatedAt: now,
          version: store.version + 1,
        },
      }
    );

    await this.auditService.log({
      actorId: adminId,
      action: 'store:suspend',
      targetType: 'store',
      targetId: storeId,
      reason,
      requestId,
    });

    const updated = await storesCol.findOne({ _id: storeId });
    return this.toStoreDto(updated!);
  }

  async listAdminProducts(
    query: AdminListProductsQuery
  ): Promise<{ data: ProductDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.storeId) filter.storeId = query.storeId;

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const productsCol = this.getProductsCollection();
    const [docs, total] = await Promise.all([
      productsCol.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      productsCol.countDocuments(filter),
    ]);

    return {
      data: docs.map((d) => this.toProductDto(d)),
      total,
    };
  }

  async adminApproveProduct(
    adminId: string,
    productId: string,
    requestId?: string
  ): Promise<ProductDto> {
    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');

    const now = new Date();
    await productsCol.updateOne(
      { _id: productId },
      {
        $set: {
          status: 'active',
          rejectionReason: undefined,
          updatedAt: now,
          version: product.version + 1,
        },
      }
    );

    await this.auditService.log({
      actorId: adminId,
      action: 'product:approve',
      targetType: 'product',
      targetId: productId,
      requestId,
    });

    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  async adminRejectProduct(
    adminId: string,
    productId: string,
    reason: string,
    requestId?: string
  ): Promise<ProductDto> {
    const productsCol = this.getProductsCollection();
    const product = await productsCol.findOne({ _id: productId });
    if (!product) throw new NotFoundError('Product not found');

    const now = new Date();
    await productsCol.updateOne(
      { _id: productId },
      {
        $set: {
          status: 'rejected',
          rejectionReason: reason.trim(),
          updatedAt: now,
          version: product.version + 1,
        },
      }
    );

    await this.auditService.log({
      actorId: adminId,
      action: 'product:reject',
      targetType: 'product',
      targetId: productId,
      reason,
      requestId,
    });

    const updated = await productsCol.findOne({ _id: productId });
    return this.toProductDto(updated!);
  }

  // ══════════════════════════════════════════════════════════════
  // ── DTO Helpers ──
  // ══════════════════════════════════════════════════════════════

  private toStoreDto(s: StoreDoc): StoreDto {
    return {
      id: s._id,
      merchantProfileId: s.merchantProfileId,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      slug: s.slug,
      descriptionAr: s.descriptionAr,
      descriptionEn: s.descriptionEn,
      governorateId: s.governorateId,
      localityId: s.localityId,
      categories: s.categories,
      logoMediaId: s.logoMediaId,
      bannerMediaId: s.bannerMediaId,
      status: s.status,
      rejectionReason: s.rejectionReason,
      suspensionReason: s.suspensionReason,
      version: s.version,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private toProductDto(p: ProductDoc): ProductDto {
    return {
      id: p._id,
      storeId: p.storeId,
      titleAr: p.titleAr,
      titleEn: p.titleEn,
      slug: p.slug,
      descriptionAr: p.descriptionAr,
      descriptionEn: p.descriptionEn,
      categoryId: p.categoryId,
      sku: p.sku,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      stockQuantity: p.stockQuantity,
      mediaIds: p.mediaIds,
      status: p.status,
      rejectionReason: p.rejectionReason,
      version: p.version,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toPublicProductDto(p: ProductDoc, storeSlug: string): PublicProductDto {
    return {
      id: p._id,
      storeId: p.storeId,
      storeSlug,
      titleAr: p.titleAr,
      titleEn: p.titleEn,
      slug: p.slug,
      descriptionAr: p.descriptionAr,
      descriptionEn: p.descriptionEn,
      categoryId: p.categoryId,
      sku: p.sku,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      stockQuantity: p.stockQuantity,
      mediaIds: p.mediaIds,
    };
  }
}

