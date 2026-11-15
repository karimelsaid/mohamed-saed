import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { taxonomyService } from './taxonomy.service.js';
import { ValidationError } from '../../platform/http/errors.js';

const createCategorySchema = z.object({
  type: z.enum(['service', 'product']),
  parentId: z.string().min(1).nullable().optional(),
  nameAr: z.string().min(1, 'Arabic name is required').max(200),
  nameEn: z.string().min(1, 'English name is required').max(200),
  descriptionAr: z.string().max(1000).optional(),
  descriptionEn: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
  nameAr: z.string().min(1).max(200).optional(),
  nameEn: z.string().min(1).max(200).optional(),
  descriptionAr: z.string().max(1000).optional(),
  descriptionEn: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createSpecialtySchema = z.object({
  categoryId: z.string().min(1, 'Category ID is required'),
  nameAr: z.string().min(1, 'Arabic name is required').max(200),
  nameEn: z.string().min(1, 'English name is required').max(200),
});

const updateSpecialtySchema = z.object({
  nameAr: z.string().min(1).max(200).optional(),
  nameEn: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export class TaxonomyController {
  // ── Public endpoints ──

  async listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = typeof req.query['type'] === 'string' ? req.query['type'] as 'service' | 'product' : undefined;
      const tree = typeof req.query['tree'] === 'string' && req.query['tree'] === 'true';

      if (tree && type) {
        const treeData = await taxonomyService.getCategoryTree(type);
        res.json({ success: true, data: treeData });
        return;
      }

      const categories = await taxonomyService.listCategories({
        type,
        status: 'active',
      });
      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  }

  async listSpecialties(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryId = typeof req.query['categoryId'] === 'string' ? req.query['categoryId'] : undefined;
      const specialties = await taxonomyService.listSpecialties({
        categoryId,
        status: 'active',
      });
      res.json({ success: true, data: specialties });
    } catch (err) {
      next(err);
    }
  }

  // ── Admin endpoints ──

  async adminCreateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = createCategorySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Category validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const category = await taxonomyService.createCategory(parseResult.data);
      res.status(201).json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  }

  async adminUpdateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Category ID is required');

      const parseResult = updateCategorySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Category update validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const category = await taxonomyService.updateCategory(id, parseResult.data);
      res.json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  }

  async adminListCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = typeof req.query['type'] === 'string' ? req.query['type'] as 'service' | 'product' : undefined;
      const status = typeof req.query['status'] === 'string' ? req.query['status'] as 'active' | 'inactive' : undefined;

      const categories = await taxonomyService.listCategories({ type, status });
      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  }

  async adminCreateSpecialty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = createSpecialtySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Specialty validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const specialty = await taxonomyService.createSpecialty(parseResult.data);
      res.status(201).json({ success: true, data: specialty });
    } catch (err) {
      next(err);
    }
  }

  async adminUpdateSpecialty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
      if (!id) throw new ValidationError('Specialty ID is required');

      const parseResult = updateSpecialtySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Specialty update validation failed', {
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const specialty = await taxonomyService.updateSpecialty(id, parseResult.data);
      res.json({ success: true, data: specialty });
    } catch (err) {
      next(err);
    }
  }
}

export const taxonomyController = new TaxonomyController();

