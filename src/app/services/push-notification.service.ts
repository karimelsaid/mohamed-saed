import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, Subject } from 'rxjs';
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
            this.registerNativeListeners();
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

    async getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'default'> {
        if (Capacitor.isNativePlatform()) {
            const status = await PushNotifications.checkPermissions();
            return status.receive;
        } else {
            if (!('Notification' in window)) {
                return 'denied';
            }
            return Notification.permission as 'granted' | 'denied' | 'prompt' | 'default';
        }
    }

    get isEnabled(): boolean {
        return this.swPush.isEnabled || Capacitor.isNativePlatform();
    }

    async subscribeToNotifications(): Promise<any> {
        console.error('🔔 Subscribe: Starting subscription flow...');

        // 1. Native App (Android/iOS)
        if (Capacitor.isNativePlatform()) {
            console.log('📱 Native Platform detected. Registering for Push Notifications...');
            return await this.registerNativePush();
        }

        // 2. Web / PWA
        if (!this.swPush.isEnabled) {
            console.warn('Service Workers are not enabled or supported.');
            throw new Error('Service Workers are disabled (Dev Mode). Use Production Build to test.');
        }

        try {
            console.error('🔔 DEBUG: Starting subscription flow (WEB)...');
            console.error('🔔 DEBUG: SERVER_URL:', this.SERVER_URL);

            // 1. Get Public Key from Backend
            const keyObs = this.http.get(`${this.SERVER_URL}/notifications/public-key`);
            if (!keyObs) throw new Error('Http.get for public-key returned undefined!');

            const keyResponse: any = await firstValueFrom(keyObs);
            if (!keyResponse || !keyResponse.publicKey) throw new Error('Invalid key response');

            const publicKey = keyResponse.publicKey;
            console.log('🔔 Requesting Web Subscription...');

            const subscription = await this.swPush.requestSubscription({
                serverPublicKey: publicKey
            });

            // Send to Backend (Web Type)
            const subObs = this.http.post(`${this.SERVER_URL}/notifications/subscribe`, { subscription });
            await firstValueFrom(subObs);

            console.log('✅ Web Subscription successful');
            return subscription;

        } catch (err) {
            console.error('❌ Could not subscribe to notifications', err);
            // Don't rethrow to avoid crushing the app entirely, just log it.
            // throw err; 
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
