export type StoreStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'suspended'
  | 'rejected';

export type ProductStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'archived';

export interface StoreDoc {
  _id: string;
  merchantProfileId: string;
  merchantUserId: string;
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
  status: StoreStatus;
  rejectionReason?: string;
  suspensionReason?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreDto {
  id: string;
  merchantProfileId: string;
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
  status: StoreStatus;
  rejectionReason?: string;
  suspensionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStoreDto {
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
  status: 'active';
}

export interface ProductDoc {
  _id: string;
  storeId: string;
  merchantUserId: string;
  titleAr: string;
  titleEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  categoryId: string;
  sku: string;
  price: number; // integer piastres
  compareAtPrice?: number; // integer piastres
  stockQuantity: number;
  onHand?: number;
  reserved?: number;
  mediaIds: string[];
  status: ProductStatus;
  rejectionReason?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDto {
  id: string;
  storeId: string;
  titleAr: string;
  titleEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  categoryId: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  onHand?: number;
  reserved?: number;
  mediaIds: string[];
  status: ProductStatus;
  rejectionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProductDto {
  id: string;
  storeId: string;
  storeSlug: string;
  titleAr: string;
  titleEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  categoryId: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  onHand?: number;
  reserved?: number;
  mediaIds: string[];
}

