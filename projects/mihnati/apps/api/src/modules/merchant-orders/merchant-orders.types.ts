import type {
  MerchantOrderDoc,
  MerchantOrderDto,
  MerchantOrderStatus,
  DeliveryAddressSnapshot,
  OrderItemSnapshot,
} from '../commerce/commerce.types.js';

export type {
  MerchantOrderDoc,
  MerchantOrderDto,
  MerchantOrderStatus,
  DeliveryAddressSnapshot,
  OrderItemSnapshot,
};

export interface RejectOrderInput {
  reason: string;
}

export interface DispatchOrderInput {
  courierName?: string;
  trackingNumber?: string;
  dispatchNotes?: string;
}

export interface MarkDeliveredInput {
  proofNotes: string;
  proofMediaRef?: string;
}

export interface CancelOrderInput {
  reason: string;
}

export interface ListOrdersQuery {
  status?: MerchantOrderStatus;
  limit?: number;
  offset?: number;
}

