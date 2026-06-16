import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { App } from '@capacitor/app';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'applying' | 'complete' | 'error';

@Injectable({
  providedIn: 'root'
})
export class LiveUpdateService {
  private currentApp: 'kenouz' | 'mushaf' = 'kenouz';

  private getStorageKey(appName: 'kenouz' | 'mushaf'): string {
    return appName === 'mushaf' ? 'last_live_update_version_mushaf' : 'last_live_update_version';
  }

  private statusSubject = new BehaviorSubject<UpdateStatus>('idle');
  public status$ = this.statusSubject.asObservable();

  private progressSubject = new BehaviorSubject<number>(0);
  public progress$ = this.progressSubject.asObservable();

  private versionSubject = new BehaviorSubject<string>('');
  public version$ = this.versionSubject.asObservable();

  private errorSubject = new BehaviorSubject<string>('');
  public error$ = this.errorSubject.asObservable();

  private sizeBytesSubject = new BehaviorSubject<number>(0);
  public sizeBytes$ = this.sizeBytesSubject.asObservable();

  private sizeFormattedSubject = new BehaviorSubject<string>('');
  public sizeFormatted$ = this.sizeFormattedSubject.asObservable();

  constructor(private http: HttpClient) { }

  public async initialize(appName: 'kenouz' | 'mushaf' = 'kenouz'): Promise<void> {
    this.currentApp = appName;
    const storageKey = this.getStorageKey(appName);

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await CapacitorUpdater.notifyAppReady();
      console.log('✅ [LiveUpdate] App ready notified');

      // Get Native Version and Sync Storage
      const info = await App.getInfo();
      const nativeVersion = info.version;
      const storedVersion = localStorage.getItem(storageKey) || '1.0.0';

      console.log(`[LiveUpdate] Native: ${nativeVersion}, Stored: ${storedVersion}`);

      // If native version is newer than stored version (e.g., fresh APK install), 
      // reset stored version to native to prevent old update triggers.
      if (this.isNewerVersion(storedVersion, nativeVersion)) {
        console.log('[LiveUpdate] Native app is newer. Syncing storage version.');
        localStorage.setItem(storageKey, nativeVersion);
        this.versionSubject.next(nativeVersion);
      }
    } catch (e) {
      console.warn('⚠️ [LiveUpdate] Failed to notify app ready or sync version:', e);
    }

    // Start checking for updates
    console.log('[LiveUpdate] Initializing update check...');
    await this.checkForUpdates();
  }

  public async checkForUpdates(): Promise<void> {
    if (this.statusSubject.value !== 'idle' && this.statusSubject.value !== 'error') return;

    try {
      // SILENT CHECK: Don't set 'checking' status immediately to avoid UI flicker
      const serverConfig: any = await firstValueFrom(this.http.get(`${environment.apiBaseUrl}/mobile-version?app=${this.currentApp}`));

      if (!serverConfig || !serverConfig.liveUpdate || !serverConfig.liveUpdate.enabled) {
        this.statusSubject.next('idle');
        return;
      }

      const { version: latestVersion, zipUrl, sizeBytes, sizeFormatted } = serverConfig.liveUpdate;
      const currentVersion = localStorage.getItem(this.getStorageKey(this.currentApp)) || '1.0.0';

      // Set the dynamic size information
      this.sizeBytesSubject.next(sizeBytes || 0);
      this.sizeFormattedSubject.next(sizeFormatted || '');

      console.log(`[LiveUpdate] Current (local): ${currentVersion}, Remote: ${latestVersion}, Size: ${sizeFormatted}`);
      this.versionSubject.next(latestVersion);

      // Check if postponed for this session
      if (typeof window !== 'undefined' && sessionStorage.getItem('postponed_update_version') === latestVersion) {
        console.log('[LiveUpdate] Update postponed for this session.');
        this.statusSubject.next('idle');
        return;
      }

      if (this.isNewerVersion(currentVersion, latestVersion)) {
        console.log(`[LiveUpdate] Mandatory update available: ${latestVersion}`);
        this.statusSubject.next('checking'); // Only show modal now that we KNOW there's an update
      } else {
        console.log('[LiveUpdate] App is up to date.');
        this.statusSubject.next('idle');
      }
    } catch (error: any) {
      // SILENT FAIL: Version check is a background operation.
      // Never show an error modal here — only startUpdate() should surface errors.
      console.warn('[LiveUpdate] Version check failed (offline or backend unreachable). Staying idle.', error?.status || error?.message || '');
      this.statusSubject.next('idle');
    }
  }

  public postponeUpdate(): void {
    const latestVersion = this.versionSubject.value;
    if (latestVersion && typeof window !== 'undefined') {
      sessionStorage.setItem('postponed_update_version', latestVersion);
    }
    this.statusSubject.next('idle');
    console.log('[LiveUpdate] Update postponed successfully.');
  }

  public async startUpdate(): Promise<void> {
    try {
      const latestVersion = this.versionSubject.value;
      const serverConfig: any = await firstValueFrom(this.http.get(`${environment.apiBaseUrl}/mobile-version?app=${this.currentApp}`));
      const zipUrl = serverConfig.liveUpdate.zipUrl;

      this.statusSubject.next('downloading');
      this.progressSubject.next(0);

      // Listen for download progress using v8 'download' event
      console.log('[LiveUpdate] Attaching progress listener...');
      const progressListener = await (CapacitorUpdater as any).addListener('download', (data: any) => {
        if (data && typeof data.percent === 'number') {
          console.log(`[LiveUpdate] Download Percent: ${data.percent}%`);
          this.progressSubject.next(Math.round(data.percent));
        }
      });

      console.log(`[LiveUpdate] Downloading from ${zipUrl}...`);
      const bundle = await CapacitorUpdater.download({
        url: zipUrl,
        version: latestVersion,
      });

      console.log('[LiveUpdate] Download result:', JSON.stringify(bundle));

      if (progressListener) progressListener.remove();
      this.statusSubject.next('applying');
      
      // DIAGNOSTIC: List all bundles to see if the downloaded one is there
      try {
        const bundles = await CapacitorUpdater.list();
        console.log('[LiveUpdate] Current bundles on device:', JSON.stringify(bundles));
      } catch (listErr) {
        console.warn('[LiveUpdate] Could not list bundles:', listErr);
      }

      console.log(`[LiveUpdate] Applying bundle ID: ${bundle.id}`);
      
      // Small delay to ensure the plugin has registered the bundle in its DB
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await CapacitorUpdater.set({
          id: bundle.id,
        });
        
        // Only save to localStorage if set() was successful (it will trigger reload)
        console.log('[LiveUpdate] Bundle set successfully. Saving version to storage.');
        localStorage.setItem(this.getStorageKey(this.currentApp), latestVersion);
        
      } catch (setErr: any) {
        console.error('[LiveUpdate] CapacitorUpdater.set failed:', setErr);
        // If it fails here, we definitely shouldn't save the version
        throw setErr;
      }

      this.statusSubject.next('complete');
      console.log('[LiveUpdate] Process complete. Reloading...');
      
      // Explicit reload to ensure the new version is loaded immediately
      setTimeout(async () => {
        try {
          await CapacitorUpdater.reload();
        } catch (reloadErr) {
          console.error('[LiveUpdate] Manual reload failed, user might need to restart app:', reloadErr);
          // Fallback: window.location.reload() or just notify complete
          window.location.reload();
        }
      }, 1000);

    } catch (error: any) {
      console.error('❌ [LiveUpdate] Update failed:', error);
      this.errorSubject.next(error.message || 'فشل تحميل التحديث');
      this.statusSubject.next('error');
    }
  }

  private isNewerVersion(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const c = currentParts[i] || 0;
        const l = latestParts[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }
    return false;
  }
}
