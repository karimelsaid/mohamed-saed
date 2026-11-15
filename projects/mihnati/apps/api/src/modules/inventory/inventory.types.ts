export type MovementType =
  | 'restock'
  | 'damage'
  | 'shrinkage'
  | 'audit_correction'
  | 'reserved'
  | 'released'
  | 'committed';

export type ReservationStatus = 'active' | 'committed' | 'released' | 'expired';

export interface InventoryMovementDoc {
  _id: string;
  productId: string;
  storeId: string;
  merchantUserId?: string;
  type: MovementType;
  quantityDelta: number;
  reason: string;
  referenceId?: string;
  previousOnHand: number;
  newOnHand: number;
  previousReserved: number;
  newReserved: number;
  createdAt: Date;
}

export interface InventoryMovementDto {
  id: string;
  productId: string;
  storeId: string;
  type: MovementType;
  quantityDelta: number;
  reason: string;
  referenceId?: string;
  onHand: number;
  reserved: number;
  available: number;
  createdAt: string;
}

export interface InventoryReservationDoc {
  _id: string;
  orderId: string;
  productId: string;
  storeId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryReservationDto {
  id: string;
  orderId: string;
  productId: string;
  storeId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface StockProjectionDto {
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
  updatedAt: string;
}

