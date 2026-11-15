import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StoresService } from './stores.service.js';
import { UnauthenticatedError, ValidationError } from '../../platform/http/errors.js';
import { ProductStatus, StoreStatus } from './stores.types.js';

const createStoreSchema = z.object({
  nameAr: z.string().min(2, 'Arabic store name is required'),
  nameEn: z.string().min(2, 'English store name is required'),
  slug: z.string().min(2, 'Store slug is required'),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  governorateId: z.string().min(1, 'Governorate is required'),
  localityId: z.string().optional(),
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  logoMediaId: z.string().optional(),
  bannerMediaId: z.string().optional(),
});

const updateStoreSchema = z.object({
  nameAr: z.string().min(2).optional(),
  nameEn: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  governorateId: z.string().optional(),
  localityId: z.string().optional(),
  categories: z.array(z.string()).min(1).optional(),
  logoMediaId: z.string().optional(),
  bannerMediaId: z.string().optional(),
});

const createProductSchema = z.object({
  titleAr: z.string().min(2, 'Arabic product title is required'),
  titleEn: z.string().min(2, 'English product title is required'),
  slug: z.string().min(2, 'Product slug is required'),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  categoryId: z.string().min(1, 'Category ID is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.number().int().nonnegative('Price must be non-negative integer piastres'),
  compareAtPrice: z.number().int().nonnegative().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  mediaIds: z.array(z.string()).optional(),
});

const updateProductSchema = z.object({
  titleAr: z.string().min(2).optional(),
  titleEn: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  categoryId: z.string().optional(),
  sku: z.string().min(1).optional(),
  price: z.number().int().nonnegative().optional(),
  compareAtPrice: z.number().int().nonnegative().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  mediaIds: z.array(z.string()).optional(),
});

const rejectOrSuspendSchema = z.object({
  reason: z.string().min(3, 'Reason is required and must be at least 3 characters'),
});

function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || '';
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export class StoresController {
  constructor(private storesService: StoresService) {}

  // ══════════════════════════════════════════════════════════════
  // ── Store Endpoints ──
  // ══════════════════════════════════════════════════════════════

  createStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = createStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const store = await this.storesService.createStoreDraft(req.user.id, parsed.data);
      res.status(201).json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  getOwnStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const store = await this.storesService.getOwnStore(req.user.id);
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  updateOwnStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = updateStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const store = await this.storesService.updateOwnStore(req.user.id, parsed.data);
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  submitStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const store = await this.storesService.submitStoreForApproval(req.user.id);
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  pauseStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const store = await this.storesService.pauseOwnStore(req.user.id);
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  resumeStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const store = await this.storesService.resumeOwnStore(req.user.id);
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  getPublicStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = getParam(req, 'slug');
      const store = await this.storesService.getPublicStoreBySlug(slug);
      res.json({
        data: store,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Product Endpoints ──
  // ══════════════════════════════════════════════════════════════

  createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const parsed = createProductSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const product = await this.storesService.createProductDraft(req.user.id, parsed.data);
      res.status(201).json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  listOwnProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;
      const status = req.query.status as ProductStatus | undefined;
      const categoryId = req.query.categoryId as string | undefined;

      const result = await this.storesService.listOwnProducts(req.user.id, {
        status,
        categoryId,
        page,
        pageSize,
      });

      res.json({
        data: result.data,
        pagination: {
          page,
          pageSize,
          total: result.total,
          hasNext: page * pageSize < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getOwnProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const product = await this.storesService.getOwnProduct(req.user.id, id);
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = updateProductSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const product = await this.storesService.updateProductDraft(
        req.user.id,
        id,
        parsed.data
      );
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  submitProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const product = await this.storesService.submitProductForReview(
        req.user.id,
        id
      );
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  pauseProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const product = await this.storesService.pauseProduct(req.user.id, id);
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  resumeProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const product = await this.storesService.resumeProduct(req.user.id, id);
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  archiveProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const product = await this.storesService.archiveProduct(req.user.id, id);
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  listPublicStoreProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = getParam(req, 'slug');
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;
      const categoryId = req.query.categoryId as string | undefined;

      const result = await this.storesService.listPublicStoreProducts(slug, {
        categoryId,
        page,
        pageSize,
      });

      res.json({
        data: result.data,
        pagination: {
          page,
          pageSize,
          total: result.total,
          hasNext: page * pageSize < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  getPublicProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req, 'id');
      const product = await this.storesService.getPublicProduct(id);
      res.json({
        data: product,
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ── Admin Endpoints ──
  // ══════════════════════════════════════════════════════════════

  adminListStores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;
      const status = req.query.status as StoreStatus | undefined;

      const result = await this.storesService.listAdminStores({ status, page, pageSize });
      res.json({
        data: result.data,
        pagination: {
          page,
          pageSize,
          total: result.total,
          hasNext: page * pageSize < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminApproveStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const store = await this.storesService.adminApproveStore(
        req.user.id,
        id,
        getRequestId(req)
      );
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  adminRejectStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = rejectOrSuspendSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const store = await this.storesService.adminRejectStore(
        req.user.id,
        id,
        parsed.data.reason,
        getRequestId(req)
      );
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  adminSuspendStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = rejectOrSuspendSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const store = await this.storesService.adminSuspendStore(
        req.user.id,
        id,
        parsed.data.reason,
        getRequestId(req)
      );
      res.json({
        data: store,
        meta: { requestId: getRequestId(req), version: store.version },
      });
    } catch (err) {
      next(err);
    }
  };

  adminListProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;
      const status = req.query.status as ProductStatus | undefined;
      const storeId = req.query.storeId as string | undefined;

      const result = await this.storesService.listAdminProducts({
        status,
        storeId,
        page,
        pageSize,
      });

      res.json({
        data: result.data,
        pagination: {
          page,
          pageSize,
          total: result.total,
          hasNext: page * pageSize < result.total,
        },
        meta: { requestId: getRequestId(req) },
      });
    } catch (err) {
      next(err);
    }
  };

  adminApproveProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const product = await this.storesService.adminApproveProduct(
        req.user.id,
        id,
        getRequestId(req)
      );
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };

  adminRejectProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthenticatedError();
      const id = getParam(req, 'id');
      const parsed = rejectOrSuspendSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { errors: parsed.error.flatten().fieldErrors });
      }
      const product = await this.storesService.adminRejectProduct(
        req.user.id,
        id,
        parsed.data.reason,
        getRequestId(req)
      );
      res.json({
        data: product,
        meta: { requestId: getRequestId(req), version: product.version },
      });
    } catch (err) {
      next(err);
    }
  };
}
