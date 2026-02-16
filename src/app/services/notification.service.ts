import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Notification {
  _id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  relatedId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private baseUrl = `${environment.apiBaseUrl}/users`; // Adjust base URL as needed

  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  constructor(private http: HttpClient) { }

  getNotifications(userId: string): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.baseUrl}/notifications/${userId}`);
  }

  refreshNotifications(userId: string): void {
    this.getNotifications(userId).subscribe(notifications => {
      this.notificationsSubject.next(notifications);
    });
  }

  markAsRead(userId: string, notificationId: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/notifications/${userId}/${notificationId}`, {});
  }

  markAsReadAndRefresh(userId: string, notificationId: string): void {
    this.markAsRead(userId, notificationId).subscribe(() => {
      this.refreshNotifications(userId);
    });
  }

  // New method to delete a notification
  deleteNotification(userId: string, notificationId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/notifications/${userId}/${notificationId}`);
  }

  addNotification(notification: Notification): void {
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([notification, ...current]);
  }

  clearNotifications(): void {
    this.notificationsSubject.next([]);
  }
}
