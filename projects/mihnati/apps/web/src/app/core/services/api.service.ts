import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HealthResponse, ReadyResponse } from '@mihnati/contracts';

export interface CategoryItem {
  id: string;
  type: 'service' | 'product';
  nameAr: string;
  nameEn: string;
  slug: string;
  icon?: string;
  status: string;
}

export interface GovernorateItem {
  _id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}

export interface ServiceItem {
  id: string;
  professionalProfileId: string;
  categoryId: string;
  title: string;
  description: string;
  priceType: 'fixed' | 'estimated' | 'hourly';
  pricePiastres: number;
  governorateId: string;
  localityId?: string;
  status: string;
  createdAt: string;
}

export interface ProductItem {
  id: string;
  storeId: string;
  storeSlug?: string;
  titleAr: string;
  titleEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  categoryId: string;
  sku: string;
  price: number; // integer piastres
  compareAtPrice?: number;
  stockQuantity: number;
  mediaIds?: string[];
  status?: string;
}

export interface StoreItem {
  id?: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  descriptionAr?: string;
  descriptionEn?: string;
  governorateId: string;
  localityId?: string;
  categories: string[];
  status: string;
}

export interface ServiceRequestItem {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  governorateId: string;
  localityId?: string;
  status: string;
  offersCount?: number;
  createdAt: string;
}

export interface OfferItem {
  id: string;
  serviceRequestId: string;
  professionalProfileId: string;
  pricePiastres: number;
  description: string;
  status: string;
  createdAt: string;
}

export interface ServiceOrderItem {
  id: string;
  serviceRequestId: string;
  professionalProfileId: string;
  status: 'created' | 'scheduled' | 'in_progress' | 'submitted' | 'completed' | 'disputed' | 'cancelled';
  pricePiastres: number;
  addressConsentGranted: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  contextType: string;
  contextId: string;
  participants: string[];
  lastMessageText?: string;
  lastMessageAt?: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1';

  // ── Health & Diagnostics ──
  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`);
  }

  getReadiness(): Observable<ReadyResponse> {
    return this.http.get<ReadyResponse>(`${this.baseUrl}/ready`);
  }

  // ── Geography & Categories ──
  getGovernorates(): Observable<{ data: GovernorateItem[] }> {
    return this.http.get<{ data: GovernorateItem[] }>(`${this.baseUrl}/geography/governorates`);
  }

  getCategories(type?: 'service' | 'product'): Observable<{ data: CategoryItem[] }> {
    let params = new HttpParams();
    if (type) params = params.set('type', type);
    return this.http.get<{ data: CategoryItem[] }>(`${this.baseUrl}/categories`, { params });
  }

  // ── Services Catalog ──
  searchServices(filter?: {
    categoryId?: string;
    governorateId?: string;
    query?: string;
  }): Observable<{ data: ServiceItem[] }> {
    let params = new HttpParams();
    if (filter?.categoryId) params = params.set('categoryId', filter.categoryId);
    if (filter?.governorateId) params = params.set('governorateId', filter.governorateId);
    if (filter?.query) params = params.set('query', filter.query);
    return this.http.get<{ data: ServiceItem[] }>(`${this.baseUrl}/services/search`, { params });
  }

  getMyServices(): Observable<{ data: ServiceItem[] }> {
    return this.http.get<{ data: ServiceItem[] }>(`${this.baseUrl}/services/me`);
  }

  createService(data: {
    categoryId: string;
    title: string;
    description: string;
    priceType: string;
    pricePiastres: number;
    governorateId: string;
  }): Observable<{ data: ServiceItem }> {
    return this.http.post<{ data: ServiceItem }>(`${this.baseUrl}/services`, data);
  }

  // ── Service Requests & Offers ──
  getMyRequests(): Observable<{ data: ServiceRequestItem[] }> {
    return this.http.get<{ data: ServiceRequestItem[] }>(`${this.baseUrl}/service-requests/me`);
  }

  createServiceRequest(data: {
    categoryId: string;
    title: string;
    description: string;
    governorateId: string;
    manualLocationText?: string;
  }): Observable<{ data: ServiceRequestItem }> {
    return this.http.post<{ data: ServiceRequestItem }>(`${this.baseUrl}/service-requests`, data);
  }

  publishServiceRequest(id: string): Observable<{ data: ServiceRequestItem }> {
    return this.http.post<{ data: ServiceRequestItem }>(`${this.baseUrl}/service-requests/${id}/publish`, {});
  }

  getRequestOffers(requestId: string): Observable<{ data: OfferItem[] }> {
    return this.http.get<{ data: OfferItem[] }>(`${this.baseUrl}/service-requests/${requestId}/offers`);
  }

  selectOffer(offerId: string): Observable<{ data: { orderId: string } }> {
    return this.http.post<{ data: { orderId: string } }>(`${this.baseUrl}/offers/${offerId}/select`, {});
  }

  // ── Service Orders ──
  getMyOrders(): Observable<{ data: ServiceOrderItem[] }> {
    return this.http.get<{ data: ServiceOrderItem[] }>(`${this.baseUrl}/service-orders/me`);
  }

  startOrder(orderId: string): Observable<{ data: ServiceOrderItem }> {
    return this.http.post<{ data: ServiceOrderItem }>(`${this.baseUrl}/service-orders/${orderId}/start`, {});
  }

  submitOrder(orderId: string): Observable<{ data: ServiceOrderItem }> {
    return this.http.post<{ data: ServiceOrderItem }>(`${this.baseUrl}/service-orders/${orderId}/submit`, {});
  }

  completeOrder(orderId: string): Observable<{ data: ServiceOrderItem }> {
    return this.http.post<{ data: ServiceOrderItem }>(`${this.baseUrl}/service-orders/${orderId}/complete`, {});
  }

  grantAddressConsent(orderId: string): Observable<{ data: { addressConsentGranted: boolean } }> {
    return this.http.post<{ data: { addressConsentGranted: boolean } }>(
      `${this.baseUrl}/service-orders/${orderId}/address-consent`,
      {}
    );
  }

  // ── Stores & Products ──
  getPublicStore(slug: string): Observable<{ data: StoreItem }> {
    return this.http.get<{ data: StoreItem }>(`${this.baseUrl}/stores/${slug}`);
  }

  getPublicStoreProducts(slug: string): Observable<{ data: ProductItem[] }> {
    return this.http.get<{ data: ProductItem[] }>(`${this.baseUrl}/stores/${slug}/products`);
  }

  getOwnStore(): Observable<{ data: StoreItem }> {
    return this.http.get<{ data: StoreItem }>(`${this.baseUrl}/stores/me`);
  }

  createStore(data: {
    nameAr: string;
    nameEn: string;
    slug: string;
    descriptionAr?: string;
    descriptionEn?: string;
    governorateId: string;
    categories: string[];
  }): Observable<{ data: StoreItem }> {
    return this.http.post<{ data: StoreItem }>(`${this.baseUrl}/stores/me`, data);
  }

  submitStoreForApproval(): Observable<{ data: StoreItem }> {
    return this.http.post<{ data: StoreItem }>(`${this.baseUrl}/stores/me/submit`, {});
  }

  getOwnProducts(): Observable<{ data: ProductItem[] }> {
    return this.http.get<{ data: ProductItem[] }>(`${this.baseUrl}/products`);
  }

  createProduct(data: {
    titleAr: string;
    titleEn: string;
    slug: string;
    descriptionAr?: string;
    descriptionEn?: string;
    categoryId: string;
    sku: string;
    price: number;
    stockQuantity?: number;
  }): Observable<{ data: ProductItem }> {
    return this.http.post<{ data: ProductItem }>(`${this.baseUrl}/products`, data);
  }

  // ── Communications & Notifications ──
  getNotifications(): Observable<{ data: NotificationItem[] }> {
    return this.http.get<{ data: NotificationItem[] }>(`${this.baseUrl}/notifications`);
  }

  markAllNotificationsRead(): Observable<any> {
    return this.http.post(`${this.baseUrl}/notifications/mark-all-read`, {});
  }

  getConversations(): Observable<{ data: ConversationItem[] }> {
    return this.http.get<{ data: ConversationItem[] }>(`${this.baseUrl}/conversations`);
  }

  getMessages(conversationId: string): Observable<{ data: MessageItem[] }> {
    return this.http.get<{ data: MessageItem[] }>(`${this.baseUrl}/conversations/${conversationId}/messages`);
  }

  sendMessage(conversationId: string, text: string): Observable<{ data: MessageItem }> {
    return this.http.post<{ data: MessageItem }>(`${this.baseUrl}/conversations/${conversationId}/messages`, { text });
  }
}
