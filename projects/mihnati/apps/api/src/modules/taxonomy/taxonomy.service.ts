import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../platform/http/errors.js';
import type {
  CategoryDoc,
  CategoryDto,
  CategoryType,
  CategoryStatus,
  SpecialtyDoc,
  SpecialtyDto,
} from './taxonomy.types.js';

/**
 * Generate a URL-safe slug from Arabic or English text.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface CreateCategoryInput {
  type: CategoryType;
  parentId?: string | null;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon?: string;
  sortOrder?: number;
  status?: CategoryStatus;
}

export interface CreateSpecialtyInput {
  categoryId: string;
  nameAr: string;
  nameEn: string;
}

export interface UpdateSpecialtyInput {
  nameAr?: string;
  nameEn?: string;
  status?: CategoryStatus;
}

export class TaxonomyService {
  /**
   * Seed initial categories if collection is empty.
   */
  async seedIfEmpty(): Promise<void> {
    const db = getDb();
    const count = await db.collection<CategoryDoc>('categories').countDocuments();
    if (count > 0) return;

    const serviceCategories = [
      { nameAr: 'صيانة منزلية', nameEn: 'Home Maintenance', slug: 'home-maintenance' },
      { nameAr: 'تنظيف', nameEn: 'Cleaning', slug: 'cleaning' },
      { nameAr: 'نقل وشحن', nameEn: 'Moving & Shipping', slug: 'moving-shipping' },
      { nameAr: 'تعليم وتدريب', nameEn: 'Education & Training', slug: 'education-training' },
      { nameAr: 'صحة وجمال', nameEn: 'Health & Beauty', slug: 'health-beauty' },
      { nameAr: 'سيارات', nameEn: 'Automotive', slug: 'automotive' },
      { nameAr: 'تكنولوجيا', nameEn: 'Technology', slug: 'technology' },
      { nameAr: 'حرف ومهن', nameEn: 'Trades & Crafts', slug: 'trades-crafts' },
    ];

    const productCategories = [
      { nameAr: 'أدوات منزلية', nameEn: 'Home Tools', slug: 'home-tools' },
      { nameAr: 'إلكترونيات', nameEn: 'Electronics', slug: 'electronics' },
      { nameAr: 'مستلزمات مكتبية', nameEn: 'Office Supplies', slug: 'office-supplies' },
    ];

    const now = new Date();

    for (let i = 0; i < serviceCategories.length; i++) {
      const cat = serviceCategories[i];
      await db.collection<CategoryDoc>('categories').insertOne({
        _id: randomUUID(),
        type: 'service',
        parentId: null,
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
        normalizedSlug: cat.slug,
        sortOrder: (i + 1) * 10,
        status: 'active',
        depth: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (let i = 0; i < productCategories.length; i++) {
      const cat = productCategories[i];
      await db.collection<CategoryDoc>('categories').insertOne({
        _id: randomUUID(),
        type: 'product',
        parentId: null,
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
        normalizedSlug: cat.slug,
        sortOrder: (i + 1) * 10,
        status: 'active',
        depth: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * List categories, optionally filtered by type and status.
   * Returns a flat list. Use buildTree() for nested structure.
   */
  async listCategories(params?: {
    type?: CategoryType;
    status?: CategoryStatus;
    parentId?: string | null;
  }): Promise<CategoryDto[]> {
    const db = getDb();
    const filter: Record<string, unknown> = {};
    if (params?.type) filter['type'] = params.type;
    if (params?.status) filter['status'] = params.status;
    if (params?.parentId !== undefined) filter['parentId'] = params.parentId;

    const docs = await db
      .collection<CategoryDoc>('categories')
      .find(filter)
      .sort({ sortOrder: 1, nameAr: 1 })
      .toArray();

    return docs.map((d) => this.toCategoryDto(d));
  }

  /**
   * Build a category tree for a given type, returning only active categories.
   */
  async getCategoryTree(type: CategoryType): Promise<CategoryDto[]> {
    const db = getDb();
    const allDocs = await db
      .collection<CategoryDoc>('categories')
      .find({ type, status: 'active' })
      .sort({ sortOrder: 1, nameAr: 1 })
      .toArray();

    const dtos = allDocs.map((d) => this.toCategoryDto(d));
    return this.buildTree(dtos);
  }

  /**
   * Create a category. Validates no cycle and unique slug.
   */
  async createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
    const db = getDb();
    const slug = slugify(input.nameEn);

    const parentId = input.parentId ?? null;
    let depth = 0;

    // If has parent, validate it exists and calculate depth
    if (parentId) {
      const parent = await db.collection<CategoryDoc>('categories').findOne({ _id: parentId });
      if (!parent) {
        throw new NotFoundError('Parent category not found');
      }
      if (parent.type !== input.type) {
        throw new ValidationError('Parent category must be the same type');
      }
      depth = parent.depth + 1;
      if (depth > 3) {
        throw new ValidationError('Category nesting depth cannot exceed 3 levels');
      }
    }

    // Unique (type, parentId, normalizedSlug) check
    const existing = await db.collection<CategoryDoc>('categories').findOne({
      type: input.type,
      parentId,
      normalizedSlug: slug,
    });
    if (existing) {
      throw new ConflictError(
        `A category with slug "${slug}" already exists under the same parent`,
        'CONFLICT',
        { slug, parentId }
      );
    }

    const now = new Date();
    const doc: CategoryDoc = {
      _id: randomUUID(),
      type: input.type,
      parentId,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      normalizedSlug: slug,
      descriptionAr: input.descriptionAr,
      descriptionEn: input.descriptionEn,
      icon: input.icon,
      sortOrder: input.sortOrder ?? 0,
      status: 'active',
      depth,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<CategoryDoc>('categories').insertOne(doc);
    return this.toCategoryDto(doc);
  }

  /**
   * Get a single category by ID.
   */
  async getCategoryById(id: string): Promise<CategoryDoc> {
    const db = getDb();
    const doc = await db.collection<CategoryDoc>('categories').findOne({ _id: id });
    if (!doc) throw new NotFoundError('Category not found');
    return doc;
  }

  /**
   * Update a category. Validates no cycle if parentId is changed.
   */
  async updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
    const db = getDb();
    const category = await this.getCategoryById(id);

    const updateFields: Partial<CategoryDoc> = { updatedAt: new Date() };

    if (input.nameAr !== undefined) updateFields.nameAr = input.nameAr;
    if (input.nameEn !== undefined) {
      updateFields.nameEn = input.nameEn;
      const newSlug = slugify(input.nameEn);
      // Check uniqueness of new slug
      const existing = await db.collection<CategoryDoc>('categories').findOne({
        type: category.type,
        parentId: category.parentId,
        normalizedSlug: newSlug,
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictError(
          `A category with slug "${newSlug}" already exists under the same parent`
        );
      }
      updateFields.normalizedSlug = newSlug;
    }
    if (input.descriptionAr !== undefined) updateFields.descriptionAr = input.descriptionAr;
    if (input.descriptionEn !== undefined) updateFields.descriptionEn = input.descriptionEn;
    if (input.icon !== undefined) updateFields.icon = input.icon;
    if (input.sortOrder !== undefined) updateFields.sortOrder = input.sortOrder;
    if (input.status !== undefined) updateFields.status = input.status;

    await db.collection<CategoryDoc>('categories').updateOne(
      { _id: id },
      { $set: updateFields }
    );

    const updated = await this.getCategoryById(id);
    return this.toCategoryDto(updated);
  }

  /**
   * Check whether making `candidateId` a child of `parentId` would create a cycle.
   * Used defensively when re-parenting categories.
   */
  async wouldCreateCycle(candidateId: string, parentId: string): Promise<boolean> {
    const db = getDb();
    let current: string | null = parentId;
    const visited = new Set<string>();

    while (current) {
      if (current === candidateId) return true;
      if (visited.has(current)) return true; // already cycled somewhere
      visited.add(current);

      const doc: CategoryDoc | null = await db.collection<CategoryDoc>('categories').findOne({ _id: current });
      current = doc?.parentId ?? null;
    }

    return false;
  }

  // ── Specialties ──

  /**
   * List specialties, optionally by category.
   */
  async listSpecialties(params?: {
    categoryId?: string;
    status?: CategoryStatus;
  }): Promise<SpecialtyDto[]> {
    const db = getDb();
    const filter: Record<string, unknown> = {};
    if (params?.categoryId) filter['categoryId'] = params.categoryId;
    if (params?.status) filter['status'] = params.status;

    const docs = await db
      .collection<SpecialtyDoc>('specialties')
      .find(filter)
      .sort({ nameAr: 1 })
      .toArray();

    return docs.map((d) => this.toSpecialtyDto(d));
  }

  /**
   * Create a specialty under a category.
   */
  async createSpecialty(input: CreateSpecialtyInput): Promise<SpecialtyDto> {
    const db = getDb();
    // Validate category exists
    const category = await this.getCategoryById(input.categoryId);
    if (category.status !== 'active') {
      throw new ValidationError('Cannot add specialty to inactive category');
    }

    const slug = slugify(input.nameEn);
    // Unique slug within category
    const existing = await db.collection<SpecialtyDoc>('specialties').findOne({
      categoryId: input.categoryId,
      normalizedSlug: slug,
    });
    if (existing) {
      throw new ConflictError(`Specialty with slug "${slug}" already exists in this category`);
    }

    const now = new Date();
    const doc: SpecialtyDoc = {
      _id: randomUUID(),
      categoryId: input.categoryId,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      normalizedSlug: slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<SpecialtyDoc>('specialties').insertOne(doc);
    return this.toSpecialtyDto(doc);
  }

  /**
   * Update a specialty.
   */
  async updateSpecialty(id: string, input: UpdateSpecialtyInput): Promise<SpecialtyDto> {
    const db = getDb();
    const doc = await db.collection<SpecialtyDoc>('specialties').findOne({ _id: id });
    if (!doc) throw new NotFoundError('Specialty not found');

    const updateFields: Partial<SpecialtyDoc> = { updatedAt: new Date() };
    if (input.nameAr !== undefined) updateFields.nameAr = input.nameAr;
    if (input.nameEn !== undefined) {
      updateFields.nameEn = input.nameEn;
      updateFields.normalizedSlug = slugify(input.nameEn);
    }
    if (input.status !== undefined) updateFields.status = input.status;

    await db.collection<SpecialtyDoc>('specialties').updateOne(
      { _id: id },
      { $set: updateFields }
    );

    const updated = await db.collection<SpecialtyDoc>('specialties').findOne({ _id: id });
    return this.toSpecialtyDto(updated!);
  }

  // ── Private helpers ──

  private toCategoryDto(doc: CategoryDoc): CategoryDto {
    return {
      id: doc._id,
      type: doc.type,
      parentId: doc.parentId,
      nameAr: doc.nameAr,
      nameEn: doc.nameEn,
      slug: doc.normalizedSlug,
      descriptionAr: doc.descriptionAr,
      descriptionEn: doc.descriptionEn,
      icon: doc.icon,
      sortOrder: doc.sortOrder,
      status: doc.status,
      depth: doc.depth,
    };
  }

  private toSpecialtyDto(doc: SpecialtyDoc): SpecialtyDto {
    return {
      id: doc._id,
      categoryId: doc.categoryId,
      nameAr: doc.nameAr,
      nameEn: doc.nameEn,
      slug: doc.normalizedSlug,
      status: doc.status,
    };
  }

  /**
   * Build a nested tree structure from a flat list of CategoryDtos.
   */
  private buildTree(flatList: CategoryDto[]): CategoryDto[] {
    const map = new Map<string, CategoryDto>();
    const roots: CategoryDto[] = [];

    for (const item of flatList) {
      item.children = [];
      map.set(item.id, item);
    }

    for (const item of flatList) {
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(item);
      } else {
        roots.push(item);
      }
    }

    return roots;
  }
}

export const taxonomyService = new TaxonomyService();
