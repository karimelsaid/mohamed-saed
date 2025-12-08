import { Injectable } from '@angular/core';
import { AppUpdate } from '@capawesome/capacitor-app-update';
import { Capacitor } from '@capacitor/core';

@Injectable({
    providedIn: 'root'
})
export class AppUpdateService {

    constructor() { }

    public async checkForUpdate(): Promise<void> {
        if (Capacitor.getPlatform() !== 'android') {
            return;
        }

        try {
            const appUpdateInfo = await AppUpdate.getAppUpdateInfo();

            if (appUpdateInfo.immediateUpdateAllowed) {
                await AppUpdate.performImmediateUpdate();
            } else if (appUpdateInfo.flexibleUpdateAllowed) {
                await AppUpdate.startFlexibleUpdate();
            }
        } catch (error) {
            // Silently fail in case of errors (e.g. app not on play store yet during dev)
            console.warn('App update check failed:', error);
        }
    }
}
