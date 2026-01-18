import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class MockPushNotificationService {

    public pushPayload = new Subject<any>();

    constructor() { }

    initialPermissionRequest() {
        console.log('MockPushNotificationService: Permission requested (Mock)');
        return Promise.resolve();
    }

    getPermissionStatus() {
        return Promise.resolve({ permission: 'granted', hasSubscription: false });
    }

    get isEnabled() {
        return false;
    }

    subscribeToNotifications() {
        console.log('MockPushNotificationService: Subscribe called (Mock)');
        return Promise.resolve(null);
    }

    unsubscribeFromNotifications() {
        console.log('MockPushNotificationService: Unsubscribe called (Mock)');
        return Promise.resolve();
    }
}
