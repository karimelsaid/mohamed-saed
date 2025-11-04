import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductStateService {
  // BehaviorSubject للمنتجات - يحتفظ بالقيمة الأخيرة
  private productsSubject = new BehaviorSubject<any[]>([]);
  public products$ = this.productsSubject.asObservable();

  // BehaviorSubject للطلبات
  private ordersSubject = new BehaviorSubject<any[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  // BehaviorSubject لطلبات التحديث
  private updateRequestsSubject = new BehaviorSubject<any[]>([]);
  public updateRequests$ = this.updateRequestsSubject.asObservable();

  // BehaviorSubject لحالة التحميل
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor() {}

  // تحديث المنتجات
  updateProducts(products: any[]): void {
    this.productsSubject.next(products);
  }

  // الحصول على المنتجات الحالية
  getCurrentProducts(): any[] {
    return this.productsSubject.value;
  }

  // تحديث الطلبات
  updateOrders(orders: any[]): void {
    this.ordersSubject.next(orders);
  }

  // الحصول على الطلبات الحالية
  getCurrentOrders(): any[] {
    return this.ordersSubject.value;
  }

  // تحديث طلبات التحديث
  updateUpdateRequests(requests: any[]): void {
    this.updateRequestsSubject.next(requests);
  }

  // الحصول على طلبات التحديث الحالية
  getCurrentUpdateRequests(): any[] {
    return this.updateRequestsSubject.value;
  }

  // تحديث حالة التحميل
  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  // إشعار بحذف منتج
  notifyProductDeleted(productId: string): void {
    const currentProducts = this.getCurrentProducts();
    const updatedProducts = currentProducts.filter(p => p._id !== productId);
    this.updateProducts(updatedProducts);
  }

  // إشعار بإضافة منتج
  notifyProductAdded(product: any): void {
    const currentProducts = this.getCurrentProducts();
    const updatedProducts = [product, ...currentProducts];
    this.updateProducts(updatedProducts);
  }

  // إشعار بتحديث منتج
  notifyProductUpdated(updatedProduct: any): void {
    const currentProducts = this.getCurrentProducts();
    const updatedProducts = currentProducts.map(p =>
      p._id === updatedProduct._id ? updatedProduct : p
    );
    this.updateProducts(updatedProducts);
  }

  // إشعار بحذف طلب
  notifyOrderDeleted(orderId: string): void {
    const currentOrders = this.getCurrentOrders();
    const updatedOrders = currentOrders.filter(o => o._id !== orderId);
    this.updateOrders(updatedOrders);
  }

  // إعادة تعيين جميع البيانات
  resetData(): void {
    this.productsSubject.next([]);
    this.ordersSubject.next([]);
    this.updateRequestsSubject.next([]);
    this.loadingSubject.next(false);
  }
}
