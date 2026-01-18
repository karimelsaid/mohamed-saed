import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, Subject, timeout, catchError, of, take } from 'rxjs';
import { environment } from '../../environments/environment';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

@Injectable({
    providedIn: 'root'
})
export class PushNotificationService {

    private readonly SERVER_URL = environment.apiBaseUrl || '/api';

    constructor(
        private http: HttpClient,
        private swPush: SwPush
    ) {
        // Initialize listeners if on native platform
        if (Capacitor.isNativePlatform()) {
            // this.registerNativeListeners();
        }
    }

    /**
     * Called on App Start to prompt for permissions if not yet determined.
     */
    async initialPermissionRequest() {
        if (Capacitor.isNativePlatform()) {
            const permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                // Initial Request
                const newStatus = await PushNotifications.requestPermissions();
                if (newStatus.receive === 'granted') {
                    await PushNotifications.register();
                }
            } else if (permStatus.receive === 'granted') {
                // Already granted, just ensure valid registration
                await PushNotifications.register();
            }
        }
    }

    async getPermissionStatus(): Promise<{ permission: string, hasSubscription: boolean }> {
        if (Capacitor.isNativePlatform()) {
            const status = await PushNotifications.checkPermissions();
            return { permission: status.receive, hasSubscription: false }; // Capacitor handles this differently
        } else {
            if (!('Notification' in window)) {
                return { permission: 'denied', hasSubscription: false };
            }

            let hasSub = false;
            try {
                // CRITICAL: Timeout after 2s if SW is not responding (common in Dev Mode)
                const sub = await firstValueFrom(
                    this.swPush.subscription.pipe(
                        timeout(2000),
                        catchError(() => of(null))
                    )
                );
                hasSub = !!sub;
            } catch (e) {
                // Silent fail
            }

            return {
                permission: Notification.permission as string,
                hasSubscription: hasSub
            };
        }
    }

    get isEnabled(): boolean {
        return this.swPush.isEnabled || Capacitor.isNativePlatform();
    }

    async subscribeToNotifications(): Promise<any> {
        // 1. Native App (Android/iOS)
        if (Capacitor.isNativePlatform()) {
            return await this.registerNativePush();
        }

        try {
            // 1. Explicitly request permission first (independent of Service Worker)
            if ('Notification' in window && Notification.permission !== 'granted') {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                    throw new Error('تم رفض تصريح التنبيهات من المتصفح.');
                }
            }

            // 2. Now check if SW is enabled for the actual subscription
            if (!this.swPush.isEnabled) {
                throw new Error('Service Worker غير مفعل. الإشعارات تعمل فقط في نسخة الـ Production أو PWA.');
            }

            const status = await this.getPermissionStatus();
            const keyObs = this.http.get(`${this.SERVER_URL}/notifications/public-key`);
            const keyResponse: any = await firstValueFrom(keyObs);
            if (!keyResponse || !keyResponse.publicKey) throw new Error('فشل الحصول على مفتاح التشفير من الخادم.');

            const publicKey = keyResponse.publicKey;
            const subscription = await this.swPush.requestSubscription({
                serverPublicKey: publicKey
            });

            // 3. Send to Backend
            await firstValueFrom(this.http.post(`${this.SERVER_URL}/notifications/subscribe`, { subscription }));

            return subscription;

        } catch (err: any) {
            console.error('❌ [PushService] Subscription failed:', err);
            let msg = err.message || 'خطأ غير معروف';
            if (err.name === 'NotAllowedError') msg = 'يرجى تفعيل التنبيهات من إعدادات المتصفح (موقوف حالياً).';
            throw err;
        }
    }

    // --- Native Implementation ---

    private async registerNativePush() {
        // Request permission
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            throw new Error('User denied permissions!');
        }

        // Register with Apple / Google to get token
        await PushNotifications.register();

        // Return a promise that resolves when the token is received (via listener)
        // For UI feedback, we just resolve true essentially immediately
        return true;
    }

    // Subject to notify components (Navbar) that a push arrived
    public pushPayload = new Subject<any>();

    private registerNativeListeners() {
        // Create high importance channel for Android
        PushNotifications.createChannel({
            id: 'fcm_default_channel',
            name: 'Important Notifications',
            description: 'Critical updates from Knooz',
            importance: 5,
            visibility: 1,
            vibration: true,
        });

        // On success, we get a token
        PushNotifications.addListener('registration', async (token) => {
            console.log('📱 Push Registration Success. Token:', token.value);
            // Send to Backend (Android Type)
            try {
                await firstValueFrom(this.http.post(`${this.SERVER_URL}/notifications/subscribe`, {
                    token: token.value,
                    platform: 'android'
                }));
                console.log('✅ Native Token sent to backend');
            } catch (e) {
                console.error('❌ Failed to send native token to backend', e);
            }
        });

        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('❌ Push Registration Error: ' + JSON.stringify(error));
        });

        PushNotifications.addListener('pushNotificationReceived', async (notification) => {
            console.log('🔔 Push Received (Foreground):', notification);
            // Notify subscribers to refresh UI
            this.pushPayload.next(notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('🔔 Push Action Performed:', notification);
            // Navigate to specific page if needed
        });
    }

    async unsubscribeFromNotifications() {
        try {
            if (Capacitor.isNativePlatform()) {
                // Native unsubscribe logic not fully exposed by Capacitor 
                // typically we just tell backend to delete token
                return;
            }

            // 1. Unsubscribe locally (Web)
            const sub = await firstValueFrom(this.swPush.subscription);
            if (sub) {
                // 2. Notify Backend to remove endpoint
                await firstValueFrom(this.http.post(`${this.SERVER_URL}/notifications/unsubscribe`, { endpoint: (sub as any).endpoint }));

                // 3. Unsubscribe from SwPush
                await this.swPush.unsubscribe();
                console.log('Unsubscribed from notifications.');
            }
        } catch (err) {
            console.error('Error unsubscribing', err);
        }
    }


}
