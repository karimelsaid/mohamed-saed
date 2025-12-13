import { Injectable } from '@angular/core';
import { AppUpdate } from '@capawesome/capacitor-app-update';
import { Capacitor } from '@capacitor/core';
import { HttpClient } from '@angular/common/http';
import { App } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';
import { Browser } from '@capacitor/browser';
import { firstValueFrom } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AppUpdateService {

    constructor(private http: HttpClient) { }

    public async checkForUpdate(): Promise<void> {
        if (Capacitor.getPlatform() !== 'android') {
            return;
        }

        // 1. Check Native In-App Update (Optional, non-blocking usually)
        this.checkNativeUpdate();

        // 2. Check Backend Forced Update (Blocking)
        this.checkBackendForcedUpdate();
    }

    private async checkNativeUpdate() {
        try {
            const appUpdateInfo = await AppUpdate.getAppUpdateInfo();
            if (appUpdateInfo.immediateUpdateAllowed) {
                await AppUpdate.performImmediateUpdate();
            } else if (appUpdateInfo.flexibleUpdateAllowed) {
                await AppUpdate.startFlexibleUpdate();
            }
        } catch (error) {
            console.warn('Native update check failed:', error);
        }
    }

    private async checkBackendForcedUpdate() {
        try {
            // Fetch version info from backend
            const serverConfig: any = await firstValueFrom(this.http.get('https://knoozbook.com/api/mobile-version'));

            if (!serverConfig || !serverConfig.android) return;

            const androidConfig = serverConfig.android;
            const minBuild = androidConfig.minBuildNumber;
            const storeUrl = androidConfig.storeUrl;

            // Get current app info
            const appInfo = await App.getInfo();
            // info.build corresponds to versionCode in Android (e.g., "7")
            const currentBuild = parseInt(appInfo.build || '0', 10);

            console.log(`Current Build: ${currentBuild}, Min Build: ${minBuild}`);

            if (currentBuild < minBuild && androidConfig.forceUpdate) {
                await this.showForceUpdateDialog(storeUrl);
            }

        } catch (error) {
            console.error('Backend update check failed:', error);
        }
    }

    private async showForceUpdateDialog(storeUrl: string) {
        const { value } = await Dialog.confirm({
            title: 'تحديث ضروري',
            message: 'يتوفر إصدار جديد هام من التطبيق. يرجى التحديث للمتابعة.',
            okButtonTitle: 'تحديث الآن',
            cancelButtonTitle: 'إغلاق التطبيق'
        });

        if (value) {
            // User clicked Update
            await Browser.open({ url: storeUrl });
            // Re-show dialog or exit? Ideally we wait or loop.
            // For simplicity, we assume they go to store. We can close app or re-prompt.
            // Let's re-prompt to ensure they can't use the app without updating.
            this.showForceUpdateDialog(storeUrl);
        } else {
            // User clicked Cancel -> Exit App
            App.exitApp();
        }
    }
}
