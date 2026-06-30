import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { of, EMPTY } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsTrackingService {
  private backendApiUrl = '/api/analytics/track';
  private sessionId: string;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.sessionId = this.getOrCreateSessionId();
  }

  /**
   * Gets or creates a session ID from sessionStorage
   */
  private getOrCreateSessionId(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return 'ssr_session_' + Date.now();
    }

    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = this.generateSessionId();
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Generates a random session ID using crypto.randomUUID() with fallback
   */
  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Gets the current user ID from localStorage
   * Checks multiple common keys for user ID
   */
  private getUserId(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return 'anonymous';
    }

    try {
      // Try common localStorage keys
      const keys = ['currentUser', 'userId', 'user_id', 'userData', 'token'];
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value) {
          if (key === 'token') {
            // Try to decode JWT and extract user ID
            try {
              const payload = value.split('.')[1];
              if (payload) {
                const decoded = JSON.parse(atob(payload));
                if (decoded.userId || decoded._id || decoded.id) {
                  return decoded.userId || decoded._id || decoded.id;
                }
              }
            } catch (e) {
              // JWT decode failed, continue
            }
          } else {
            const parsed = JSON.parse(value);
            if (parsed._id || parsed.id || parsed.userId) {
              return parsed._id || parsed.id || parsed.userId;
            }
          }
        }
      }
    } catch (e) {
      // Silently handle parsing errors
    }
    return 'anonymous';
  }

  /**
   * Gets device type based on screen width
   */
  private getDevice(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return 'desktop';
    }
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  }

  /**
   * Tracks an event to backend API (fire and forget)
   */
  private trackEvent(eventType: string, productId?: string, metadata?: any): void {
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip tracking during SSR
    }

    const payload = {
      eventType,
      productId: productId || '',
      userId: this.getUserId(),
      sessionId: this.sessionId,
      metadata: {
        timestamp: new Date().toISOString(),
        device: this.getDevice(),
        ...metadata
      }
    };

    console.log('[AnalyticsTrackingService] Tracking event:', eventType, payload);

    // Fire and forget - silent error handling
    this.http.post(this.backendApiUrl, payload).pipe(
      catchError(err => {
        console.error('[AnalyticsTrackingService] Error tracking event:', err);
        return EMPTY;
      })
    ).subscribe(response => {
      console.log('[AnalyticsTrackingService] Event tracked successfully:', response);
    });
  }

  /**
   * Tracks an impression event (when a product card appears)
   */
  trackImpression(productId: string, source: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.trackEvent('impression', productId, { source });
  }

  /**
   * Tracks a click event (when user clicks on a product)
   */
  trackClick(productId: string, source: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.trackEvent('click', productId, { source });
  }

  /**
   * Tracks a search event (when user performs a search)
   */
  trackSearch(searchTerm: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.trackEvent('search', undefined, { searchTerm: searchTerm.trim() });
  }

  /**
   * Tracks a purchase batch event (when an order with multiple products is completed)
   */
  trackPurchaseBatch(
    products: Array<{ productId: string; amount: number }>,
    orderId: string
  ): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!products || products.length === 0) return;

    const totalAmount = products.reduce((sum, p) => sum + (p.amount || 0), 0);

    const payload = {
      eventType: 'purchase_batch',
      orderId,
      userId: this.getUserId(),
      sessionId: this.sessionId,
      products,
      metadata: {
        totalAmount,
        itemCount: products.length,
        timestamp: new Date().toISOString(),
        device: this.getDevice()
      }
    };

    // Fire and forget - silent error handling
    this.http.post(this.backendApiUrl, payload).pipe(
      catchError(() => EMPTY)
    ).subscribe();
  }

  /**
   * Tracks a comment event (when user submits a comment)
   */
  trackComment(
    productId: string,
    commentId: string,
    location: string
  ): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.trackEvent('comment', productId, { platform: 'website', location });
  }
}
