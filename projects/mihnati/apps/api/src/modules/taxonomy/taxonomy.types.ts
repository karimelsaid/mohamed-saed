export type CategoryType = 'service' | 'product';
export type CategoryStatus = 'active' | 'inactive';

export interface CategoryDoc {
  _id: string;
  type: CategoryType;
  parentId: string | null;
  nameAr: string;
  nameEn: string;
  normalizedSlug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon?: string;
  sortOrder: number;
  status: CategoryStatus;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryDto {
  id: string;
  type: CategoryType;
  parentId: string | null;
  nameAr: string;
  nameEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon?: string;
  sortOrder: number;
  status: CategoryStatus;
  depth: number;
  children?: CategoryDto[];
}

export interface SpecialtyDoc {
  _id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  normalizedSlug: string;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpecialtyDto {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  status: CategoryStatus;
}

