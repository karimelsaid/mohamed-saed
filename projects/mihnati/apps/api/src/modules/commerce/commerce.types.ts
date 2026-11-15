export interface CartItem {
  productId: string;
  quantity: number;
  pricePiastres: number; // Server-recomputed integer piastres
  titleAr: string;
  titleEn: string;
  sku: string;
}

export interface CartDoc {
  _id: string;
  customerId: string;
  activeStoreId: string | null;
  items: CartItem[];
  subtotalPiastres: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartDto {
  id: string;
  activeStoreId: string | null;
  activeStoreNameAr?: string;
  items: CartItem[];
  subtotalPiastres: number;
  itemsCount: number;
  version: number;
  updatedAt: string;
}

export interface CustomerAddressDoc {
  _id: string;
  customerId: string;
  label: string;
  governorateId: string;
  localityId?: string;
  addressText: string;
  building?: string;
  floor?: string;
  apartment?: string;
  phone: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddressDto {
  id: string;
  label: string;
  governorateId: string;
  localityId?: string;
  addressText: string;
  building?: string;
  floor?: string;
  apartment?: string;
  phone: string;
  isDefault: boolean;
}

export interface DeliveryAddressSnapshot {
  addressId: string;
  label: string;
  governorateId: string;
  localityId?: string;
  addressText: string;
  building?: string;
  floor?: string;
  apartment?: string;
  phone: string;
}

export type MerchantOrderStatus =
  | 'created'
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'preparing'
  | 'in_preparation'
  | 'ready'
  | 'ready_for_delivery'
  | 'dispatched'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancel_requested'
  | 'cancelled'
  | 'disputed'
  | 'return_in_progress'
  | 'returned';

export interface OrderItemSnapshot {
  productId: string;
  titleAr: string;
  titleEn: string;
  sku: string;
  unitPricePiastres: number;
  quantity: number;
  totalPiastres: number;
}

export interface MerchantOrderDoc {
  _id: string;
  orderNumber: string;
  storeId: string;
  merchantUserId: string;
  customerId: string;
  status: MerchantOrderStatus;
  paymentMethod: 'cash_on_delivery';
  paymentStatus: 'pending';
  codExpectedPiastres: number;
  items: OrderItemSnapshot[];
  subtotalPiastres: number;
  deliveryFeePiastres: number;
  totalPiastres: number;
  deliveryAddressSnapshot: DeliveryAddressSnapshot;
  addressConsentGranted: boolean;
  addressConsentGrantedAt: Date;
  notes?: string;
  dispatchInfo?: {
    courierName?: string;
    trackingNumber?: string;
    dispatchNotes?: string;
    dispatchedAt: Date;
  };
  deliveryProof?: {
    proofNotes: string;
    proofMediaRef?: string;
    deliveredAt: Date;
  };
  cancellationInfo?: {
    reason: string;
    cancelledBy: 'customer' | 'merchant' | 'admin';
    cancelledAt: Date;
  };
  rejectionInfo?: {
    reason: string;
    rejectedAt: Date;
  };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchantOrderDto {
  id: string;
  orderNumber: string;
  storeId: string;
  customerId: string;
  status: MerchantOrderStatus;
  paymentMethod: 'cash_on_delivery';
  paymentStatus: 'pending';
  codExpectedPiastres: number;
  items: OrderItemSnapshot[];
  subtotalPiastres: number;
  deliveryFeePiastres: number;
  totalPiastres: number;
  deliveryAddressSnapshot: DeliveryAddressSnapshot;
  addressConsentGranted: boolean;
  notes?: string;
  dispatchInfo?: {
    courierName?: string;
    trackingNumber?: string;
    dispatchNotes?: string;
    dispatchedAt: string;
  };
  deliveryProof?: {
    proofNotes: string;
    proofMediaRef?: string;
    deliveredAt: string;
  };
  cancellationInfo?: {
    reason: string;
    cancelledBy: 'customer' | 'merchant' | 'admin';
    cancelledAt: string;
  };
  rejectionInfo?: {
    reason: string;
    rejectedAt: string;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutQuoteDto {
  storeId: string;
  storeNameAr: string;
  items: OrderItemSnapshot[];
  subtotalPiastres: number;
  deliveryFeePiastres: number;
  totalPiastres: number;
  deliveryAddressSnapshot: DeliveryAddressSnapshot;
}

export interface IdempotencyClaimDoc {
  _id: string;
  key: string;
  principalId: string;
  operation: string;
  requestHash: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

