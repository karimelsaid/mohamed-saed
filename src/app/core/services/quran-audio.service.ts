import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, firstValueFrom, timeout, catchError, of, throwError, tap } from 'rxjs';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { NativeAudio } from '@capgo/native-audio';
import { MediaBridge } from './media-bridge.plugin';
import { MushafDataService } from './mushaf-data.service';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface Reciter {
    id: number;
    name: string;
    style: string;
}

export interface VerseTiming {
    verse_key: string;
    timestamp_from: number;
    timestamp_to: number;
}

export interface PlaybackState {
    isPlaying: boolean;
    currentVerseKey: string | null;
    reciterId: number;
    progress: number;
    duration: number;
    isBuffering: boolean;
    playbackRate: number; // Speed Control
    repeatAyah: number; // 0 = off, 1, 2, 3...
    repeatGroup: number; // 0 = off, 1, 2, 3...
    currentAyahRepeatCount: number;
    currentGroupRepeatCount: number;
    playbackRange: 'surah' | 'page' | 'juz' | 'quran' | 'single' | 'custom';
    specificRange?: { start: string; end: string }; // e.g. { start: "1:1", end: "1:7" }
    rangeEndVerseKey?: string | null; // e.g. "1:7", the absolute stop boundary
}

@Injectable({
    providedIn: 'root'
})
export class QuranAudioService {
    private audioPrimary = new Audio();
    private audioSecondary = new Audio();
    private activeAudio = this.audioPrimary;

    // Getter to maintain compatibility with existing code using 'this.audio'
    private get audio(): HTMLAudioElement {
        return this.activeAudio;
    }

    private get standbyAudio(): HTMLAudioElement {
        return this.activeAudio === this.audioPrimary ? this.audioSecondary : this.audioPrimary;
    }
    private readonly SILENT_SRC = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    private audioUrlBase = 'https://api.quran.com/api/v4/recitations';
    private qdcAudioUrlBase = 'https://api.quran.com/api/qdc/audio/reciters';
    private readonly CACHE_NAME = 'quran-audio-v1';
    private currentObjectURL: string | null = null;
    private foregroundServiceId = 101;
    private readonly CHANNEL_ID = 'quran_playback_channel_silent';
    private userExplicitlyPaused = false;
    private wasInterrupted = false;


    // FIXED: Temporarily disabled Timed Reciters (Gapless) to force Verse-by-Verse playback
    // This resolves the stuttering/looping issues on Android for Sudais/Shuraim/etc.
    // ADDED: 174 (Yasser Al-Dossari) for gapless support as it works well with QDC segments
    private readonly TIMED_RECITERS: number[] = [174, 175]; // Added 175 (Abu Sharida)
    private currentSurahTimings: VerseTiming[] = [];
    private currentTimedReciterId: number | null = null;
    private currentVerseTiming: VerseTiming | null = null;
    private isTimedPlayback = false;
    private lastEndTriggeredVerseKey = '';
    private isPlayingNewAudio = false; // Flag to track if new audio is being loaded
    private isGaplessTransitioning = false; // Flag to track gapless transitions
    private lastVerseStartTime = 0; // Track start time to detect rapid loops
    private pendingPlayRequest: { verseKey: string; reciterId: number } | null = null; // Track pending play requests

    // PERFECTION: Precision Clocking and Cross-fade
    private overlapTimer: any = null;
    private readonly OVERLAP_TRIGGER_SEC = 0.18; // Hyper-Precise overlap (0.18s)
    private readonly FADE_DURATION_MS = 400; // Duration of volume fade (Balanced for exit)
    private readonly PRECISION_INTERVAL_MS = 16; // 60fps check frequency

    // Fallback URLs for reciters with missing/broken specific verse audio on QDC API
    private readonly RECITER_OVERRIDES: { [key: number]: string } = {
        19: 'https://everyayah.com/data/Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
        13: 'https://everyayah.com/data/Ghamadi_40kbps',
        158: 'https://everyayah.com/data/Ali_Jaber_64kbps', // Corrected from Studio path
        159: 'https://everyayah.com/data/MaherAlMuaiqly128kbps',
        174: 'https://everyayah.com/data/Yasser_Ad-Dussary_128kbps',
        // ID 175 is Abdullah Hamad Abu Sharida on Quran.com, NOT Basfar. Removing incorrect override.
        168: 'https://everyayah.com/data/Minshawy_Children_128kbps'
    };

    // Instant Preload State
    private nextVerseBlobUrl: string | null = null;
    private nextVerseKey: string | null = null;

    private state = new BehaviorSubject<PlaybackState>({
        isPlaying: false,
        currentVerseKey: null,
        reciterId: 0,
        progress: 0,
        duration: 0,
        isBuffering: false,
        playbackRate: 1,
        repeatAyah: 0,
        repeatGroup: 0,
        currentAyahRepeatCount: 0,
        currentGroupRepeatCount: 0,
        playbackRange: 'surah'
    });

    // Flag to force HTML5 Audio usage even on Native platforms (Android/iOS)
    // NativeAudio has issues on some devices. For now, use HTML5 Audio.
    // Background playback requires additional native configuration.
    private readonly FORCE_HTML5_AUDIO = true;

    private get useNativeAudio(): boolean {
        // Only use native audio if we are on a native platform AND NOT forced to use HTML5
        return Capacitor.isNativePlatform() && !this.FORCE_HTML5_AUDIO;
    }

    // Stutter guard and cancellation state
    private lastPlayCallVerseKey: string = '';
    private lastPlayCallTime: number = 0;
    private currentOperationId: number = 0;
    private activeNativeAssetId: string | null = null;


    public state$ = this.state.asObservable();
    public get snapshot(): PlaybackState {
        return this.state.value;
    }
    private verseCompleted = new BehaviorSubject<string | null>(null);
    public verseCompleted$ = this.verseCompleted.asObservable();
    private currentRepeatCount = 0;
    private maxRepeatCount = 1;

    constructor(
        private http: HttpClient,
        private dataService: MushafDataService
    ) {
        this.setupMediaSession();
        this.setupAudioListeners();
        this.setupForegroundServiceListeners();
        this.createNotificationChannel();
        this.setupInterruptionHandling();
        this.setupNativeAudioListeners();
    }

    private setupNativeAudioListeners() {
        if (Capacitor.isNativePlatform()) {
            // Critical: Listen for NativeAudio completion to trigger verse transitions
            NativeAudio.addListener('complete', (info: { assetId: string }) => {
                console.log(`[AudioService] NativeAudio complete event for: ${info.assetId}`);
                // Pass the assetId to handleAudioEnded so it can verify it's the current asset
                this.handleAudioEnded(info.assetId);
            });

            // PRODUCTION GRADE: Listen for MediaBridge (Native Player) completion
            if (Capacitor.getPlatform() === 'android') {
                MediaBridge.addListener('playbackEnded', (info: any) => {
                    console.log('[AudioService] MediaBridge playback ended event');
                    this.handleAudioEnded();
                });
            }
        }
    }

    private setupInterruptionHandling() {
        // Handle App State Changes (Background/Foreground)
        App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive && !this.userExplicitlyPaused && this.state.value.isPlaying) {
                // For both Native and Web: Force silent audio bridge to stay playing.
                // This acts as a "heartbeat" to prevent Android from throttling the WebView/JS.
                if (this.audio.paused) {
                    this.audio.play().catch(() => { });
                }

                // Refresh Notification
                this.startForegroundService();
            }
        });

        // Backup: Visibility Change
        document.addEventListener('visibilitychange', () => {
            // ... keep existing logging ...
        });
    }

    private setupForegroundServiceListeners() {
        if (Capacitor.getPlatform() === 'android') {
            ForegroundService.addListener('buttonClicked', async (event) => {
                if (event.buttonId === 1) { // Stop button
                    await this.stop();
                }
            });
        }
    }

    private async createNotificationChannel() {
        if (Capacitor.getPlatform() !== 'android') return;
        try {
            await ForegroundService.createNotificationChannel({
                id: this.CHANNEL_ID,
                name: 'تلاوة القرآن',
                description: 'إشعارات تشغيل التلاوة في الخلفية',
                importance: 3 // DEFAULT importance for media playback
            });
            // Initialize Native Audio listeners
            NativeAudio.addListener('complete', (data: { assetId: string }) => {
                console.log(`[AudioService] Native Audio Complete: ${data.assetId}`);
                this.handleAudioEnded(data.assetId);
            });
        } catch (e) {
            console.error('[AudioService] Failed to create notification channel/listeners', e);
        }
    }

    private setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.resume());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            // navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious()); // Implement if you have queue logic
            // navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext()); // Implement if you have queue logic
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined) {
                    this.audio.currentTime = details.seekTime;
                }
            });
        }
    }

    private async startForegroundService() {
        // Skip on web or if it's Android (MediaBridge uses its own native service)
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') return;

        // Get current info for notification
        const reciterId = this.state.value.reciterId;
        const verseKey = this.state.value.currentVerseKey || '';

        let title = 'تلاوة القرآن';
        let body = 'كنوز';

        if (verseKey) {
            title = `الآية ${verseKey}`;
            const reciters = await firstValueFrom(this.getReciters());
            const rName = reciters.find(r => r.id === reciterId)?.name;
            if (rName) body = rName;
        }

        try {
            await ForegroundService.startForegroundService({
                id: this.foregroundServiceId,
                body: body,
                title: title,
                smallIcon: 'ic_launcher_round',
                notificationChannelId: this.CHANNEL_ID,
                buttons: [
                    {
                        id: 1,
                        title: 'إيقاف',
                    }
                ]
            });
        } catch (error) {
            console.error('[AudioService] Failed to start foreground service:', error);
        }
    }

    private async stopForegroundService() {
        if (Capacitor.getPlatform() !== 'android') return;
        try {
            await ForegroundService.stopForegroundService();
        } catch (error) {
            // Ignore error if service wasn't running
        }
    }

    private updateMediaSessionMetadata(verseKey: string, reciterId: number) {
        if ('mediaSession' in navigator) {
            // Find reciter name
            firstValueFrom(this.getReciters()).then((reciters: Reciter[]) => {
                const reciterName = reciters.find((r: Reciter) => r.id === reciterId)?.name || 'القارئ';

                navigator.mediaSession.metadata = new MediaMetadata({
                    title: `الآية ${verseKey}`,
                    artist: reciterName,
                    album: 'كنوز',
                    artwork: [
                        { src: 'assets/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
                    ]
                });
            });
        }
    }

    private setupAudioListeners() {
        this.attachListenersToPlayer(this.audioPrimary);
        this.attachListenersToPlayer(this.audioSecondary);
    }

    private attachListenersToPlayer(player: HTMLAudioElement) {
        player.onplay = () => {
            if (player !== this.activeAudio) return;
            this.updateState({ isPlaying: true });
            this.startForegroundService();
            // CRITICAL: Set Media Session playback state for Android background audio
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
        };
        player.onpause = async () => {
            if (player !== this.activeAudio) return;
            this.updateState({ isPlaying: false });
            // Set Media Session state to paused
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
        };

        player.onended = () => {
            if (player !== this.activeAudio) return;
            this.handleAudioEnded();
        };

        player.ontimeupdate = () => {
            if (player !== this.activeAudio) return;

            if (player.playbackRate !== this.state.value.playbackRate) {
                player.playbackRate = this.state.value.playbackRate;
            }

            let progress = player.currentTime;
            let duration = player.duration || 0;

            // PERFECTION: Start Precision Clock when near end (within 2 seconds)
            if (duration > 0 && (duration - progress) <= 2.0 && !this.overlapTimer && !this.isGaplessTransitioning) {
                this.startPrecisionClock(player);
            }

            if (this.isTimedPlayback && this.currentVerseTiming) {
                const currentTimeMs = player.currentTime * 1000;

                // CRITICAL: Ignore updates if we are in the middle of a gapless transition
                if (!this.isGaplessTransitioning && !player.paused && currentTimeMs >= this.currentVerseTiming.timestamp_to) {
                    if (this.state.value.currentVerseKey === this.currentVerseTiming.verse_key) {
                        this.handleAudioEnded();
                    }
                }

                // Adjust progress/duration for UI to be verse-relative
                progress = Math.max(0, player.currentTime - (this.currentVerseTiming.timestamp_from / 1000));
                duration = Math.max(0, (this.currentVerseTiming.timestamp_to - this.currentVerseTiming.timestamp_from) / 1000);
            }

            this.updateState({
                progress: progress,
                duration: duration
            });

            if ('mediaSession' in navigator && !isNaN(duration) && duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: duration,
                        playbackRate: player.playbackRate,
                        position: player.currentTime
                    });
                } catch (e) { /* ignore */ }
            }
        };

        player.onwaiting = () => {
            if (player !== this.activeAudio) return;
            this.updateState({ isBuffering: true });
        };
        player.onplaying = () => {
            if (player !== this.activeAudio) return;
            this.updateState({ isBuffering: false, isPlaying: true });
        };
        player.oncanplay = () => {
            if (player !== this.activeAudio) return; // Standby player loads shouldn't update UI buffering
            this.updateState({ isBuffering: false });
        };
        player.onstalled = () => {
            if (player !== this.activeAudio) return;
            this.updateState({ isBuffering: true });
        };
        player.onerror = (e) => {
            if (player !== this.activeAudio) return;
            console.error('[AudioService] Playback Error:', e);
            this.updateState({ isPlaying: false, isBuffering: false });
        };
    }

    private updateState(partial: Partial<PlaybackState>) {
        this.state.next({ ...this.state.value, ...partial });
    }

    public updatePlaybackState(partial: Partial<PlaybackState>) {
        this.updateState(partial);
    }

    private async getLocalUri(verseKey: string, reciterId: number, surahIdOverride?: number): Promise<{ raw: string, converted: string } | null> {
        if (!Capacitor.isNativePlatform()) return null;
        try {
            let surah, ayah;
            if (verseKey === 'full' && surahIdOverride) {
                surah = surahIdOverride.toString();
                ayah = 'full';
            } else {
                [surah, ayah] = verseKey.split(':');
            }
            const fileName = `audio/${reciterId}/${surah}/${ayah}.mp3`;
            const result = await Filesystem.getUri({
                directory: Directory.Data,
                path: fileName
            });
            // Check if file exists
            try {
                await Filesystem.stat({
                    directory: Directory.Data,
                    path: fileName
                });
                return {
                    raw: result.uri,
                    converted: Capacitor.convertFileSrc(result.uri)
                };
            } catch (e) {
                return null;
            }
        } catch (e) {
            return null;
        }
    }

    private async probeAudioUrl(originalUrl: string): Promise<string | null> {
        try {
            // 1. Try Original
            const res1 = await fetch(originalUrl, { method: 'HEAD' });
            if (res1.ok && res1.headers.get('content-type')?.includes('audio')) return originalUrl;

            // 2. Try with .mp3 extension if not present
            if (!originalUrl.endsWith('.mp3')) {
                const mp3Url = originalUrl.replace(/\.[^/.]+$/, "") + ".mp3"; // replace extension
                const res2 = await fetch(mp3Url, { method: 'HEAD' });
                if (res2.ok && res2.headers.get('content-type')?.includes('audio')) return mp3Url;
            }

            // 3. Try with .m4a extension
            const m4aUrl = originalUrl.replace(/\.[^/.]+$/, "") + ".m4a";
            const res3 = await fetch(m4aUrl, { method: 'HEAD' });
            if (res3.ok && res3.headers.get('content-type')?.includes('audio')) return m4aUrl;

            // 4. Try alternate Miracle CDN
            // Example: https://everyayah.com/data/AbdulSamad_64kbps_QuranExplorer.Com/001001.mp3
            // Keeping it simple for now, just logging failure
            console.error(`[AudioService] All probes failed for ${originalUrl}`);
            return null;
        } catch (e) {
            console.warn('[AudioService] Probe network error, assuming original might work:', e);
            return originalUrl; // Optimistic fallback
        }
    }

    async playVerse(verseKey: string, reciterId?: number) {
        // CRITICAL: Aggressive mutex to prevent NativeAudio hammering
        if (this.isPlayingNewAudio) {
            // Already processing - completely ignore this call
            return;
        }

        const now = Date.now();
        const timeDiff = now - this.lastPlayCallTime;
        console.log(`[AudioService DEBUG] playVerse called: ${verseKey} (Reciter: ${reciterId}), Diff: ${timeDiff}ms, PlayingNew: ${this.isPlayingNewAudio}, CurrentKey: ${this.state.value.currentVerseKey}, IsPlaying: ${this.state.value.isPlaying}`);

        // Extended debounce - prevent rapid re-triggering for same verse (1.5 seconds)
        if (verseKey === this.lastPlayCallVerseKey && timeDiff < 1500) {
            console.log(`[AudioService] Debounced rapid play request for ${verseKey}. Diff was ${timeDiff}ms`);
            return;
        }

        // If currently playing the same verse, ignore
        if (this.state.value.currentVerseKey === verseKey && this.state.value.isPlaying) {
            console.log(`[AudioService] Already playing ${verseKey}, ignoring duplicate request`);
            return;
        }

        // Set mutex IMMEDIATELY before any async work
        this.isPlayingNewAudio = true;
        this.isGaplessTransitioning = false; // RESET FLAG: Allow new overlap triggers
        this.lastPlayCallVerseKey = verseKey;
        this.lastPlayCallTime = now;

        const rId = reciterId || this.state.value.reciterId;
        console.log(`[AudioService] Playing Verse: ${verseKey}, Reciter: ${rId}`);

        // Cancel any pending operation
        this.currentOperationId++;
        const operationId = this.currentOperationId;

        const wasTimed = this.isTimedPlayback;
        const willBeTimed = this.TIMED_RECITERS.includes(rId);

        // Clear any pending requests - we're handling this one now
        this.pendingPlayRequest = null;

        // Stop audio only if switching modes or if current audio is still playing
        if (!willBeTimed || wasTimed !== willBeTimed) {
            await this.stopAudioCompletely();
        } else {
            if (!this.audio.paused) {
                this.audio.pause();
            }
            this.audio.currentTime = 0;
        }

        // Check if operation was cancelled during stop
        if (operationId !== this.currentOperationId) {
            this.isPlayingNewAudio = false;
            return;
        }

        this.isTimedPlayback = willBeTimed;
        this.lastEndTriggeredVerseKey = '';

        // DUAL PLAYER: CHECK SWAP
        const isStandbyReady = this.nextVerseKey === verseKey && this.standbyAudio.src;

        if (isStandbyReady) {
            console.log(`[AudioService] STUDIO SWAP (Cross-fade) to Standby for ${verseKey}`);

            const oldActive = this.activeAudio;
            this.activeAudio = this.standbyAudio;

            // 1. Fade OUT old player
            this.fadePlayer(oldActive, 1, 0, this.FADE_DURATION_MS);

            this.updateState({
                currentVerseKey: verseKey,
                reciterId: rId,
                isBuffering: false,
                currentAyahRepeatCount: 0
            });

            this.nextVerseKey = null; // Consumed

            if (this.state.value.playbackRate !== 1) this.activeAudio.playbackRate = this.state.value.playbackRate;

            // Update Metadata non-blocking
            this.updateMediaSessionMetadata(verseKey, rId);
            this.startForegroundService();

            try {
                this.activeAudio.currentTime = 0;
                this.activeAudio.volume = 0; // Start silent for fade in
                await this.activeAudio.play();

                // 2. Fade IN new player (FAST for punchy start)
                this.fadePlayer(this.activeAudio, 0, 1, 50);

                this.isPlayingNewAudio = false;
                this.preloadNextVerse(verseKey, rId); // Trigger next preload on the *new* standby
                return;
            } catch (playError) {
                console.error('[AudioService] Studio swap failed:', playError);
                // Fallthrough to normal fetch if swap fails
            }
        }

        // Standard Load (No Standby Match)
        console.log('[AudioService] Standard loading (no standby match)...');
        this.stopPrecisionClock(); // Ensure timer isn't running for random clicks
        this.activeAudio.volume = 1; // Ensure full volume for fresh starts

        this.updateState({ currentVerseKey: verseKey, reciterId: rId, isBuffering: true, currentAyahRepeatCount: 0 });
        this.updateMediaSessionMetadata(verseKey, rId);
        this.startForegroundService();

        if (this.isTimedPlayback) {
            return this.playTimedVerse(verseKey, rId);
        }

        // If switching to non-timed playback, reset surah-level timings
        this.currentTimedReciterId = null;
        this.currentSurahTimings = [];


        try {
            const cache = await caches.open(this.CACHE_NAME);

            // CHECK OVERRIDES FIRST
            let overrideUrl: string | null = null;
            if (this.RECITER_OVERRIDES[rId]) {
                const [surah, ayah] = verseKey.split(':');
                const paddedSurah = surah.padStart(3, '0');
                const paddedAyah = ayah.padStart(3, '0');
                overrideUrl = `${this.RECITER_OVERRIDES[rId]}/${paddedSurah}${paddedAyah}.mp3`;
                console.log(`[AudioService] Using Override URL for Reciter ${rId}: ${overrideUrl}`);
            }

            let audioData;
            // If override exists, skip cache/network metadata fetch and go straight to playing
            if (overrideUrl) {
                audioData = { url: overrideUrl };
            } else {
                const metadataUrl = `${this.audioUrlBase}/${rId}/by_ayah/${verseKey}`;
                const cachedMetadata = await cache.match(metadataUrl);

                // Operation check
                if (operationId !== this.currentOperationId) return;

                if (cachedMetadata) {
                    console.log('[AudioService] Found metadata in cache');
                    const response = await cachedMetadata.json();
                    audioData = response?.audio_file || response?.audio || (response?.audio_files && response.audio_files[0]);
                } else {
                    // Fetch from network
                    const response = await firstValueFrom(
                        this.http.get<any>(metadataUrl).pipe(
                            timeout(12000),
                            catchError(err => {
                                console.error('[AudioService] Request timed out or failed:', err);
                                return of(null);
                            })
                        )
                    );

                    if (operationId !== this.currentOperationId) return;

                    if (!response) {
                        console.warn('[AudioService] Empty response or timeout');
                        // Fallback logic could go here too if we wanted to auto-retry with overrides, 
                        // but overrides are checked first now.
                        this.updateState({ isBuffering: false, isPlaying: false });
                        this.isPlayingNewAudio = false;
                        return;
                    }
                    audioData = response?.audio_file || response?.audio || (response?.audio_files && response.audio_files[0]);

                    // Optional: cache individual metadata for future
                    try { cache.put(metadataUrl, new Response(JSON.stringify(response))); } catch (e) { }
                }
            }

            if (audioData?.url) {
                let audioUrl = audioData.url;
                if (audioUrl.startsWith('//')) {
                    audioUrl = `https:${audioUrl}`;
                } else if (!audioUrl.startsWith('http')) {
                    audioUrl = `https://audio.qurancdn.com/${audioUrl}`;
                }

                // Check and Probe URL for 404s
                const validUrl = await this.probeAudioUrl(audioUrl);
                if (!validUrl) {
                    console.warn(`[AudioService] Probe failed for ${audioUrl} (Reciter: ${rId})`);
                    this.updateState({ isBuffering: false, isPlaying: false });
                    this.isPlayingNewAudio = false;
                    return;
                }
                audioUrl = validUrl;

                console.log('[AudioService] Final Audio URL:', audioUrl);

                // NATIVE OFFLINE CHECK: Check if file exists in filesystem
                const localResult = await this.getLocalUri(verseKey, rId);
                if (localResult) {
                    console.log('[AudioService] Found LOCAL file:', localResult.raw);
                    // For Android Native, pass the RAW file:// URI
                    // For fallback/other platforms, use converted
                    audioUrl = Capacitor.getPlatform() === 'android' ? localResult.raw : localResult.converted;
                }

                // PRODUCTION GRADE: Use Native MediaBridge for Android to support reliable background audio
                if (Capacitor.getPlatform() === 'android') {
                    console.log('[AudioService] Using Native MediaBridge for Android');

                    // SILENCE HTML5 Audio to save battery/CPU, but don't clear SRC yet
                    // Clearing SRC might trigger extra events we don't want
                    this.audio.pause();
                    this.standbyAudio.pause();

                    const reciters = await firstValueFrom(this.getReciters());
                    const reciterName = reciters.find(r => r.id === rId)?.name || 'القارئ';

                    // Get actual Surah name
                    const surahId = parseInt(verseKey.split(':')[0]);
                    const surahMeta = await firstValueFrom(this.dataService.getMetadata().pipe(
                        map(meta => meta.surahs.find(s => s.id === surahId))
                    ));
                    const surahName = surahMeta?.name || `سورة ${surahId}`;
                    const title = `${surahName} - الآية ${verseKey.split(':')[1]}`;

                    try {
                        await MediaBridge.play({
                            url: audioUrl,
                            title: title,
                            artist: reciterName
                        });

                        this.updateState({ isPlaying: true, isBuffering: false });
                        this.isPlayingNewAudio = false;

                        // We still use currentVerseKey for UI tracking
                        this.preloadNextVerse(verseKey, rId);
                        return;
                    } catch (bridgeError) {
                        console.error('[AudioService] MediaBridge play failed, falling back to HTML5:', bridgeError);
                        // Fallback to HTML5 if bridge fails
                        this.audio.src = localResult?.converted || audioUrl;
                        this.audio.play();
                    }
                }

                // Use the getter to determine if we should use Native Audio or fallback to HTML5
                if (this.useNativeAudio) {
                    const assetId = `verse_${verseKey.replace(':', '_')}`;

                    // Unload previous assets to prevent memory leaks
                    if (this.activeNativeAssetId && this.activeNativeAssetId !== assetId) {
                        await NativeAudio.stop({ assetId: this.activeNativeAssetId }).catch(() => { });
                        await NativeAudio.unload({ assetId: this.activeNativeAssetId }).catch(() => { });
                    }
                    this.activeNativeAssetId = assetId;

                    if (operationId !== this.currentOperationId) {
                        this.isPlayingNewAudio = false;
                        return;
                    }

                    try {
                        await NativeAudio.preload({
                            assetId,
                            assetPath: audioUrl,
                            audioChannelNum: 1,
                            isUrl: true
                        });

                        if (operationId !== this.currentOperationId) {
                            await NativeAudio.unload({ assetId }).catch(() => { });
                            this.isPlayingNewAudio = false;
                            return;
                        }


                        // Play the audio
                        this.lastVerseStartTime = Date.now();
                        await NativeAudio.play({ assetId });
                        await this.startForegroundService();
                        this.updateState({ isPlaying: true, isBuffering: false });
                        this.isPlayingNewAudio = false;
                        this.preloadNextVerse(verseKey, rId);

                    } catch (nativeError) {
                        console.error('[AudioService] Native Audio failed:', nativeError);
                        this.updateState({ isBuffering: false, isPlaying: false });
                        this.isPlayingNewAudio = false;
                    }
                    this.isPlayingNewAudio = false;
                    return;
                }

                // Check for cached audio file (Web/Standard)
                const cachedAudio = await cache.match(audioUrl);
                if (operationId !== this.currentOperationId) {
                    this.isPlayingNewAudio = false;
                    return;
                }

                if (cachedAudio) {
                    console.log('[AudioService] Playing from cache!');
                    const blob = await cachedAudio.blob();

                    // Revoke previous URL to free memory
                    if (this.currentObjectURL) {
                        URL.revokeObjectURL(this.currentObjectURL);
                    }
                    this.currentObjectURL = URL.createObjectURL(blob);
                    this.audio.src = this.currentObjectURL;
                } else {
                    if (this.currentObjectURL) {
                        URL.revokeObjectURL(this.currentObjectURL);
                        this.currentObjectURL = null;
                    }
                    this.audio.src = audioUrl;
                }

                this.audio.load();
                if (this.state.value.playbackRate !== 1) {
                    this.audio.playbackRate = this.state.value.playbackRate;
                }

                // Wait for audio to be ready for smoother playback
                await this.waitForAudioReady().catch(e => console.warn('Audio wait timeout:', e));

                if (operationId !== this.currentOperationId) {
                    this.isPlayingNewAudio = false;
                    return;
                }

                try {
                    // CRITICAL: Start Foreground Service BEFORE audio.play() for Android background support
                    await this.startForegroundService();
                    await this.audio.play();
                    console.log('[AudioService] Playback started successfully');
                    this.isPlayingNewAudio = false;
                } catch (playError) {
                    console.error('[AudioService] Playback failed/blocked:', playError);
                    this.isPlayingNewAudio = false;
                    this.updateState({ isPlaying: false, isBuffering: false });
                }
            } else {
                console.warn(`[AudioService] No audio URL found for ${rId}/${verseKey}`);
                if (audioData) {
                    console.error('[AudioService] Invalid Audio Data structure:', audioData);
                }
                this.updateState({ isBuffering: false, isPlaying: false });
                this.isPlayingNewAudio = false;
            }
        } catch (error) {
            console.error(`[AudioService] Error in playVerse for ${verseKey}:`, error);
            this.updateState({ isBuffering: false, isPlaying: false });
            this.isPlayingNewAudio = false;
        }
    }

    async pause() {
        this.userExplicitlyPaused = true;

        if (Capacitor.getPlatform() === 'android') {
            MediaBridge.pause().catch(() => { });
        }

        if (this.useNativeAudio) {
            if (this.activeNativeAssetId) {
                NativeAudio.stop({ assetId: this.activeNativeAssetId }).catch(e => console.warn('Native pause (stop) failed', e));
            }
        } else {
            this.audio.pause();
        }

        this.updateState({ isPlaying: false });
        this.stopForegroundService();
    }

    async resume() {
        this.userExplicitlyPaused = false;

        if (Capacitor.getPlatform() === 'android') {
            MediaBridge.resume().catch(() => { });
        }

        if (this.useNativeAudio) {
            if (this.activeNativeAssetId) {
                NativeAudio.play({ assetId: this.activeNativeAssetId }).catch(e => console.warn('Native resume (play) failed', e));
            } else {
                if (this.state.value.currentVerseKey) {
                    this.playVerse(this.state.value.currentVerseKey);
                }
            }
        } else {
            this.audio.play().catch(e => console.error('Resume failed:', e));
        }

        this.startForegroundService();
        this.updateState({ isPlaying: true });
    }

    stop() {
        this.userExplicitlyPaused = true;
        this.currentOperationId++;
        this.isPlayingNewAudio = false; // Force release lock
        this.lastPlayCallVerseKey = ''; // Allow immediate replay

        if (Capacitor.getPlatform() === 'android') {
            MediaBridge.stop().catch(() => { });
        }

        this.stopAudioCompletely();
        this.stopForegroundService();
        // CRITICAL: Set currentVerseKey to null to tell UI that the session is OVER.
        // This resets the "Play" button to its initial state (opening options).
        this.updateState({ isPlaying: false, progress: 0, isBuffering: false, currentVerseKey: null });
    }

    async stopAudioCompletely() {
        this.stopPrecisionClock();
        this.audio.pause();
        this.audio.currentTime = 0;
        if (this.currentObjectURL) {
            URL.revokeObjectURL(this.currentObjectURL);
            this.currentObjectURL = null;
        }

        // Force reset HTML5 audio
        this.audio.removeAttribute('src');
        this.audio.currentTime = 0;
        this.audio.load();

        if (this.useNativeAudio) {
            if (this.activeNativeAssetId) {
                await NativeAudio.stop({ assetId: this.activeNativeAssetId }).catch(() => { });
                await NativeAudio.unload({ assetId: this.activeNativeAssetId }).catch(() => { });
                this.activeNativeAssetId = null;
            }
        }
        this.audio.src = '';
    }

    prime() {
        if (!this.useNativeAudio) {
            this.audio.load();
        }
    }

    async setReciter(id: number) {
        const currentKey = this.state.value.currentVerseKey;
        const wasPlaying = this.state.value.isPlaying;

        console.log(`[AudioService] setReciter: newId=${id}, currentKey=${currentKey}, wasPlaying=${wasPlaying}`);

        // Invalidate any pending operations from previous reciter
        this.currentOperationId++;

        // Stop audio completely first to prevent overlap
        await this.stopAudioCompletely();

        // Reset timed reciter ID to force a refresh on the next play call
        this.currentTimedReciterId = null;
        this.currentSurahTimings = [];
        this.currentVerseTiming = null;
        this.lastEndTriggeredVerseKey = '';

        // Force clear current object URL to ensure we fetch new audio
        if (this.currentObjectURL) {
            URL.revokeObjectURL(this.currentObjectURL);
            this.currentObjectURL = null;
        }

        if (this.currentObjectURL) {
            URL.revokeObjectURL(this.currentObjectURL);
            this.currentObjectURL = null;
        }

        // Clear preloaded next verse blobs to prevent mixing voices
        if (this.nextVerseBlobUrl) {
            URL.revokeObjectURL(this.nextVerseBlobUrl);
            this.nextVerseBlobUrl = null;
            this.nextVerseKey = null;
        }

        this.updateState({
            reciterId: id,
            currentAyahRepeatCount: 0,
            currentGroupRepeatCount: 0,
            isPlaying: false,
            isBuffering: false
        });

        this.isGaplessTransitioning = false; // RESET FLAG: Clear any overlap state

        // Prime immediately to keep user gesture context
        this.prime();

        // If we were playing (or even if just paused on a verse), we usually want to 
        // start playing with the new reciter immediately or at least load it.
        // The user expectation is usually "Change Reciter -> Continue Hearing"
        if (currentKey) {
            console.log(`[AudioService] Re-triggering playVerse for new reciter ${id}`);
            setTimeout(() => {
                this.playVerse(currentKey, id);
            }, 100);
        }
    }

    async setPlaybackRate(rate: number) {
        this.updateState({ playbackRate: rate });

        if (this.useNativeAudio && !this.isTimedPlayback) {
            const currentKey = this.state.value.currentVerseKey;
            if (currentKey) {
                const assetId = `verse_${currentKey.replace(':', '_')}`;
                await NativeAudio.setRate({ assetId, rate }).catch(() => { });
            }
        }

        this.audio.playbackRate = rate;
    }

    async setVolume(volume: number) {
        // volume should be 0.0 to 1.0
        if (this.useNativeAudio && !this.isTimedPlayback) {
            const currentKey = this.state.value.currentVerseKey;
            if (currentKey) {
                const assetId = `verse_${currentKey.replace(':', '_')}`;
                await NativeAudio.setVolume({ assetId, volume }).catch(() => { });
            }
        }
        this.audio.volume = volume;
    }

    setRepeatSettings(ayahRepeat: number, groupRepeat: number) {
        this.updateState({
            repeatAyah: ayahRepeat,
            repeatGroup: groupRepeat,
            currentAyahRepeatCount: 0,
            currentGroupRepeatCount: 0
        });
    }

    setPlaybackRange(range: 'surah' | 'page' | 'juz' | 'quran' | 'single' | 'custom', specificRange?: { start: string; end: string }, rangeEndVerseKey?: string | null) {
        this.updateState({ playbackRange: range, specificRange, rangeEndVerseKey, currentGroupRepeatCount: 0 });
    }

    private async handleAudioEnded(sourceAssetId?: string) {
        const s = this.state.value;

        // Verify asset ID for native playback to prevent race conditions (e.g. unload triggering complete)
        if (this.useNativeAudio && !this.isTimedPlayback && sourceAssetId) {
            const currentAssetId = `verse_${s.currentVerseKey?.replace(':', '_')}`;
            if (sourceAssetId !== currentAssetId) {
                console.log(`[AudioService] Ignoring handleAudioEnded for stale asset: ${sourceAssetId} (current: ${currentAssetId})`);
                return;
            }
        }

        // Prevent handling if new audio is loading to avoid conflicts
        if (this.isPlayingNewAudio) {
            console.log('[AudioService] Ignoring handleAudioEnded - new audio loading');
            return;
        }

        // CRITICAL: Loop Breaker
        // If the audio "completed" almost instantly (< 500ms), it's likely a native error or corruption.
        // We must IGNORE it to prevent an infinite loop of Play -> Error -> Complete -> PlayNext -> Play
        const elapsed = Date.now() - this.lastVerseStartTime;
        if (elapsed < 500) {
            console.warn(`[AudioService] Rapid audio completion detected (${elapsed}ms). Ignoring loop and stopping.`);
            this.updateState({ isPlaying: false, isBuffering: false });
            return;
        }

        // 1. Ayah Repetition
        if (s.repeatAyah > 1 && s.currentAyahRepeatCount + 1 < s.repeatAyah) {
            console.log(`[AudioService] Repeating Ayah (${s.currentAyahRepeatCount + 2}/${s.repeatAyah})`);
            this.updateState({ currentAyahRepeatCount: s.currentAyahRepeatCount + 1 });

            if (this.useNativeAudio && !this.isTimedPlayback) {
                const assetId = `verse_${s.currentVerseKey?.replace(':', '_')}`;
                await NativeAudio.play({ assetId }).catch(err => {
                    console.error('[AudioService] Native replay failed:', err);
                });
            } else {
                if (this.isTimedPlayback && this.currentVerseTiming) {
                    this.audio.currentTime = this.currentVerseTiming.timestamp_from / 1000;
                } else {
                    this.audio.currentTime = 0;
                }
                this.audio.play().catch(err => {
                    console.error('[AudioService] HTML5 replay failed:', err);
                });
            }
            return;
        }

        // 2. INTERNAL AUTO-ADVANCE (Dual Player)
        // If we have the next verse ready in standby, play it IMMEDIATELY
        if (s.currentVerseKey && s.currentVerseKey !== this.lastEndTriggeredVerseKey) {
            const nextKey = this.nextVerseKey;

            // CRITICAL: Check if nextKey is within boundaries
            if (nextKey && this.standbyAudio.src && this.isWithinRange(nextKey)) {
                console.log(`[AudioService] Auto-advancing internally to ${nextKey}`);
                this.playVerse(nextKey); // Trigger swap and play
                return; // Transition handled internally
            } else if (nextKey && !this.isWithinRange(nextKey)) {
                // Truly out of range -> handle group repetitions or stop
                if (s.repeatGroup > 1 && s.currentGroupRepeatCount + 1 < s.repeatGroup) {
                    let restartKey = '';
                    if (s.playbackRange === 'custom' && s.specificRange) {
                        restartKey = s.specificRange.start;
                    } else if (s.playbackRange === 'surah' && s.currentVerseKey) {
                        restartKey = s.currentVerseKey.split(':')[0] + ':1';
                    } else if (s.playbackRange === 'single' && s.currentVerseKey) {
                        restartKey = s.currentVerseKey;
                    }

                    if (restartKey) {
                        console.log(`[AudioService] Group Repeat Triggered (${s.currentGroupRepeatCount + 2}/${s.repeatGroup}) to ${restartKey}`);
                        this.updateState({
                            currentGroupRepeatCount: s.currentGroupRepeatCount + 1,
                            currentAyahRepeatCount: 0
                        });
                        this.playVerse(restartKey);
                        return;
                    }
                }

                // Truly END of selected range
                console.log(`[AudioService] Range Reached (${nextKey} out of range ${s.rangeEndVerseKey}). Stopping playback.`);
                this.stop();
                return;
            }
            console.log(`[AudioService] Next key ${nextKey} is within range or unknown. Falling through to notify.`);
        }

        // 3. Clear Ayah Repeat count and notify completion to advance
        if (s.currentVerseKey && s.currentVerseKey !== this.lastEndTriggeredVerseKey) {
            console.log(`[AudioService] Verse ${s.currentVerseKey} completed. Notifying advance. (Range: ${s.playbackRange})`);
            this.lastEndTriggeredVerseKey = s.currentVerseKey;
            this.updateState({ currentAyahRepeatCount: 0 });
            this.verseCompleted.next(s.currentVerseKey);
        } else {
            console.log(`[AudioService] Verse already notified or no current key: ${s.currentVerseKey}`);
            this.updateState({ currentAyahRepeatCount: 0 });
        }
    }

    getReciters(): Observable<Reciter[]> {
        const CACHE_KEY = 'cached_reciters_list';
        const cached = localStorage.getItem(CACHE_KEY);

        const fetchAndCache = this.http.get<any>('https://api.quran.com/api/v4/resources/recitations?language=ar&per_page=500').pipe(
            map(res => {
                let reciters = res.recitations.map((r: any) => ({
                    id: r.id,
                    name: r.translated_name?.name || r.reciter_name,
                    style: r.style
                }));

                const missingReciters = [
                    { id: 174, name: 'ياسر الدوسري', style: 'مرتل (QDC)' },
                    { id: 159, name: 'ماهر المعيقلي', style: 'مرتل (تجريبي)' },
                    { id: 19, name: 'أحمد بن علي العجمي', style: 'مرتل (تجريبي)' },
                    { id: 158, name: 'عبدالله علي جابر', style: 'مرتل (تجريبي)' },
                    { id: 161, name: 'خليفة الطنيجي', style: 'مرتل' },
                    { id: 13, name: 'سعد الغامدي', style: 'مرتل' },
                    { id: 160, name: 'بندر بليلة', style: 'مرتل (تجريبي)' },
                    { id: 175, name: 'عبدالله حمد أبو شريدة', style: 'مرتل (تجريبي)' },
                    { id: 168, name: 'محمد صديق المنشاوي', style: 'بترديد الأطفال' }
                ];

                missingReciters.forEach(mr => {
                    if (!reciters.find((r: any) => r.id === mr.id)) {
                        reciters.push(mr);
                    }
                });

                // Sort alphabetically by name (Arabic locale)
                return reciters.sort((a: Reciter, b: Reciter) => {
                    return a.name.localeCompare(b.name, 'ar');
                });
            }),
            tap((reciters: Reciter[]) => {
                localStorage.setItem(CACHE_KEY, JSON.stringify(reciters));
            })
        );

        if (cached) {
            return of(JSON.parse(cached) as Reciter[]);
        }

        return fetchAndCache as Observable<Reciter[]>;
    }

    private async playTimedVerse(verseKey: string, reciterId: number) {
        try {
            const [surahStr, verseStr] = verseKey.split(':');
            const surahId = parseInt(surahStr);

            // Determine if we can do a seamless transition (GAPLESS)
            // Conditions: Same reciter, same surah (meaning same audio file), and audio is ready/playing
            // Note: We check if the NEW verse is in the SAME surah as the CURRENT active one
            const isSameSurah = this.currentSurahTimings.length > 0 &&
                this.currentSurahTimings[0].verse_key.split(':')[0] === surahStr;
            const isSameReciter = this.currentTimedReciterId === reciterId;
            const isGaplessCandidate = isSameReciter && isSameSurah;

            if (!isGaplessCandidate) {
                // Stop any currently playing audio first ONLY if we are changing context
                await this.stopAudioCompletely();
            }

            const cache = await caches.open(this.CACHE_NAME);

            // 1. Fetch/Cache Timings for the Surah
            const needsRefresh = this.currentSurahTimings.length === 0 ||
                this.currentSurahTimings[0].verse_key.split(':')[0] !== surahStr ||
                this.currentTimedReciterId !== reciterId;

            // If needsRefresh is true, isGaplessCandidate MUST be false by definition above

            if (needsRefresh) {
                const timingsUrl = `${this.qdcAudioUrlBase}/${reciterId}/audio_files?chapter=${surahId}&segments=true`;
                const cachedTimings = await cache.match(timingsUrl);

                let timingsRes;
                if (cachedTimings) {
                    timingsRes = await cachedTimings.json();
                } else {
                    timingsRes = await firstValueFrom(this.http.get<any>(timingsUrl).pipe(timeout(10000), catchError(() => of(null))));
                    if (timingsRes) {
                        try { cache.put(timingsUrl, new Response(JSON.stringify(timingsRes))); } catch (e) { }
                    }
                }

                if (timingsRes?.audio_files?.[0]?.verse_timings) {
                    this.currentSurahTimings = timingsRes.audio_files[0].verse_timings;
                    this.currentTimedReciterId = reciterId;

                    let audioUrl = timingsRes.audio_files[0].audio_url;
                    if (!audioUrl.startsWith('http')) audioUrl = `https:${audioUrl}`;

                    // OFFLINE CHECK for Timed Audio
                    const localResult = await this.getLocalUri('full', reciterId, surahId);

                    const cachedAudio = await cache.match(audioUrl);
                    if (localResult) {
                        console.log('[AudioService] Found local FULL audio in filesystem');
                        this.audio.src = localResult.converted;
                    } else if (cachedAudio) {
                        console.log('[AudioService] Found timed audio in cache, using Blob URL');
                        const blob = await cachedAudio.blob();
                        if (this.currentObjectURL) URL.revokeObjectURL(this.currentObjectURL);
                        this.currentObjectURL = URL.createObjectURL(blob);
                        this.audio.src = this.currentObjectURL;
                    } else {
                        if (this.currentObjectURL) {
                            URL.revokeObjectURL(this.currentObjectURL);
                            this.currentObjectURL = null;
                        }
                        this.audio.src = audioUrl;
                    }
                    this.audio.load();

                    // Wait for metadata to ensure seek works on large files
                    if (this.audio.readyState < 1) {
                        await new Promise(resolve => {
                            const handler = () => {
                                this.audio.removeEventListener('loadedmetadata', handler);
                                resolve(true);
                            };
                            this.audio.addEventListener('loadedmetadata', handler);
                            setTimeout(resolve, 2000); // 2s timeout
                        });
                    }
                } else {
                    throw new Error('Could not fetch timings');
                }
            }

            const timing = this.currentSurahTimings.find(t => t.verse_key === verseKey);
            if (!timing) {
                this.updateState({ isPlaying: false, isBuffering: false });
                this.isPlayingNewAudio = false;
                return;
            }

            // CRITICAL: Set transition flag to prevent timeupdate race conditions
            this.isGaplessTransitioning = true;
            this.currentVerseTiming = timing;

            if (this.audio.paused) {
                await this.audio.play();
            }

            // Seek to the verse ONLY if necessary
            const targetTime = timing.timestamp_from / 1000;
            const currentTime = this.audio.currentTime;

            // Gapless Logic:
            // If we are "close" to the target time, assume natural flow.
            // Increased tolerance to 2.5s to verify if it fixes "stutter/repeat" issues with some reciters
            const isCloseEnough = Math.abs(currentTime - targetTime) < 2.5;

            if (!isGaplessCandidate || !isCloseEnough) {
                console.log(`[AudioService] Seeking to verse start: ${targetTime}s (Current: ${currentTime}s)`);
                this.audio.currentTime = targetTime;
            } else {
                console.log(`[AudioService] Gapless transition: Continuous playback at ${currentTime}s`);
            }

            // Small delay to allow audio engine to stabilize before re-enabling checks
            // This is a "safety window"
            setTimeout(() => {
                this.isGaplessTransitioning = false;
            }, 500);

            this.updateState({ isPlaying: true, isBuffering: false });
            this.isPlayingNewAudio = false;
        } catch (error) {
            console.error('[AudioService] Timed playback error:', error);
            this.updateState({ isPlaying: false, isBuffering: false });
            this.isPlayingNewAudio = false;
            this.isGaplessTransitioning = false;
        }
    }



    async isSurahCached(surahId: number, reciterId: number): Promise<boolean> {
        const markerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
        const cache = await caches.open(this.CACHE_NAME);
        const marker = await cache.match(markerUrl);

        if (!marker) return false;

        if (!Capacitor.isNativePlatform()) return true;

        // Native check: verify files actually exist in filesystem
        try {
            const path = `audio/${reciterId}/${surahId}`;
            const stats = await Filesystem.readdir({
                directory: Directory.Data,
                path: path
            });
            return stats.files.length > 0;
        } catch (e) {
            return false;
        }
    }

    async downloadSurah(surahId: number, reciterId: number): Promise<void> {
        console.log(`[AudioService] Starting download: Surah ${surahId}, Reciter ${reciterId}`);
        const cache = await caches.open(this.CACHE_NAME);
        const isTimed = this.TIMED_RECITERS.includes(reciterId);

        // ABU SHARIDA (175) SPECIAL HANDLER
        if (reciterId === 175) {
            // Reciter 175 uses surah-level files only on quranicaudio.com pattern
            const audioUrl = `https://download.quranicaudio.com/quran/abdullah_abu_sharida/${surahId}.mp3`;
            const timingsUrl = `https://quran.com/api/proxy/content/api/qdc/audio/reciters/175/audio_files?chapter=${surahId}&segments=true`;

            try {
                // Download Audio File to Filesystem
                const fileName = `audio/${reciterId}/${surahId}/full.mp3`;
                await this.ensureDirectory(`audio/${reciterId}/${surahId}`);

                await Filesystem.downloadFile({
                    url: audioUrl,
                    directory: Directory.Data,
                    path: fileName
                });

                // Fetch Timings (via proxy)
                const timingsRes = await firstValueFrom(this.http.get<any>(timingsUrl).pipe(timeout(30000)));
                if (timingsRes?.audio_files?.[0]) {
                    await cache.put(timingsUrl, new Response(JSON.stringify(timingsRes)));
                }

                // Marker
                const v4MarkerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
                await cache.put(v4MarkerUrl, new Response(JSON.stringify({ downloaded: true })));

                console.log(`[AudioService] Abu Sharida download complete: Surah ${surahId}`);
                return;
            } catch (e) {
                console.error('[AudioService] Abu Sharida download failed:', e);
                throw e;
            }
        }

        if (isTimed) {
            const timingsUrl = `${this.qdcAudioUrlBase}/${reciterId}/audio_files?chapter=${surahId}&segments=true`;
            const timingsRes = await firstValueFrom(this.http.get<any>(timingsUrl).pipe(timeout(30000)));
            if (!timingsRes?.audio_files?.[0]) throw new Error('Failed to fetch timed metadata');

            let audioUrl = timingsRes.audio_files[0].audio_url;
            if (!audioUrl.startsWith('http')) audioUrl = `https:${audioUrl}`;

            // Download Audio File to FILESYSTEM
            const fileName = `audio/${reciterId}/${surahId}/full.mp3`;
            await this.ensureDirectory(`audio/${reciterId}/${surahId}`);

            await Filesystem.downloadFile({
                url: audioUrl,
                directory: Directory.Data,
                path: fileName
            });

            // Cache Timings only AFTER audio is successful (Keep in Web Cache for timing lookups)
            await cache.put(timingsUrl, new Response(JSON.stringify(timingsRes)));

            // Also cache v4 marker for isSurahCached calls from other places
            const v4MarkerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
            await cache.put(v4MarkerUrl, new Response(JSON.stringify({ downloaded: true })));

            console.log(`[AudioService] Timed download complete: Surah ${surahId}`);
            return;
        }

        // --- NON-TIMED / VERSE-BY-VERSE DOWNLOAD ---
        const metadataUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
        const hasOverride = !!this.RECITER_OVERRIDES[reciterId];

        try {
            let metaResponse: any = null;
            if (!hasOverride) {
                // Try fetching metadata from Quran.com V4 if no override exists
                metaResponse = await firstValueFrom(
                    this.http.get<any>(metadataUrl).pipe(timeout(30000), catchError(() => of(null)))
                );
            }

            let successCount = 0;
            let audioFiles: any[] = [];

            if (metaResponse?.audio_files) {
                audioFiles = metaResponse.audio_files;
            } else {
                // FALLBACK: Manual Verse List Construction for Overridden or Broken Reciters
                console.log(`[AudioService] Metadata missing for reciter ${reciterId}. Using local fallback...`);
                const mushafMeta = await firstValueFrom(this.dataService.getMetadata());
                const surahInfo = mushafMeta.surahs.find(s => s.id === surahId);
                if (!surahInfo) throw new Error(`Surah ${surahId} not found in local metadata`);

                for (let i = 1; i <= surahInfo.verses_count; i++) {
                    const verseKey = `${surahId}:${i}`;
                    let audioUrl = '';

                    if (this.RECITER_OVERRIDES[reciterId]) {
                        const paddedSurah = surahId.toString().padStart(3, '0');
                        const paddedAyah = i.toString().padStart(3, '0');
                        audioUrl = `${this.RECITER_OVERRIDES[reciterId]}/${paddedSurah}${paddedAyah}.mp3`;
                    } else {
                        // If no override and no metadata, we can't guess the URL pattern easily 
                        // unless it follows the default audio.qurancdn.com pattern.
                        // For now, if no metadata and no override, we fail.
                        continue;
                    }

                    audioFiles.push({
                        verse_key: verseKey,
                        url: audioUrl
                    });
                }
            }

            if (audioFiles.length === 0) throw new Error('No audio files found to download');

            await this.ensureDirectory(`audio/${reciterId}/${surahId}`);

            for (const item of audioFiles) {
                const ayahNum = item.verse_key.split(':')[1];
                const fileName = `audio/${reciterId}/${surahId}/${ayahNum}.mp3`;

                let audioUrl = item.url;
                if (audioUrl.startsWith('//')) {
                    audioUrl = `https:${audioUrl}`;
                } else if (!audioUrl.startsWith('http')) {
                    audioUrl = `https://audio.qurancdn.com/${audioUrl}`;
                }

                // Check and Probe URL for 404s/Correct extensions
                const validUrl = await this.probeAudioUrl(audioUrl);
                if (validUrl) audioUrl = validUrl;

                // CHECK FILESYSTEM
                let exists = false;
                try {
                    await Filesystem.stat({ directory: Directory.Data, path: fileName });
                    exists = true;
                } catch (e) { }

                if (!exists) {
                    try {
                        await Filesystem.downloadFile({
                            url: audioUrl,
                            directory: Directory.Data,
                            path: fileName
                        });
                        successCount++;
                    } catch (e) {
                        console.warn(`[AudioService] Failed to download ayah ${item.verse_key}`, e);
                        continue;
                    }
                } else {
                    successCount++;
                }

                // --- FAKE METADATA INJECTION ---
                // Cache individual ayah metadata so the player works offline for reciters without real metadata endpoints
                const ayahMetadataUrl = `${this.audioUrlBase}/${reciterId}/by_ayah/${item.verse_key}`;
                const ayahMetadata = { audio_file: { ...item, url: audioUrl } }; // Ensure URL is absolute in fixed metadata
                await cache.put(ayahMetadataUrl, new Response(JSON.stringify(ayahMetadata)));
            }

            // Only cache chapter metadata AFTER success
            if (successCount > 0) {
                const finalMeta = metaResponse || { audio_files: audioFiles, downloaded: true };
                await cache.put(metadataUrl, new Response(JSON.stringify(finalMeta)));
            }
            console.log(`[AudioService] Verse download complete: Surah ${surahId}, success: ${successCount}`);
        } catch (error) {
            console.error(`[AudioService] Download failed for Surah ${surahId}:`, error);
            throw error;
        }
    }

    private async ensureDirectory(path: string) {
        if (!Capacitor.isNativePlatform()) return;
        const parts = path.split('/');
        let currentPath = '';
        for (const part of parts) {
            currentPath += part + '/';
            try {
                await Filesystem.mkdir({
                    directory: Directory.Data,
                    path: currentPath,
                    recursive: false
                });
            } catch (e) {
                // Error 17 usually means folder exists
            }
        }
    }

    private async saveBlobToFilesystem(blob: Blob, path: string) {
        if (!Capacitor.isNativePlatform()) return;
        const reader = new FileReader();
        return new Promise<void>((resolve, reject) => {
            reader.onload = async () => {
                const base64Data = (reader.result as string).split(',')[1];
                try {
                    await Filesystem.writeFile({
                        directory: Directory.Data,
                        path: path,
                        data: base64Data
                    });
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
        });
    }

    seek(time: number) {
        this.audio.currentTime = time;
    }

    private waitForAudioReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.audio.readyState >= 3) { // HAVE_FUTURE_DATA
                resolve();
                return;
            }

            const onCanPlay = () => {
                cleanup();
                resolve();
            };

            const onError = (e: Event) => {
                cleanup();
                reject(e);
            };

            const cleanup = () => {
                this.audio.removeEventListener('canplay', onCanPlay);
                this.audio.removeEventListener('canplaythrough', onCanPlay);
                this.audio.removeEventListener('error', onError);
            };

            this.audio.addEventListener('canplay', onCanPlay);
            this.audio.addEventListener('canplaythrough', onCanPlay);
            this.audio.addEventListener('error', onError);

            // Safety timeout (5s) for network failure
            setTimeout(() => {
                cleanup();
                reject(new Error('Audio load timeout'));
            }, 5000);
        });
    }



    private async getOrFetchAudioUrl(verseKey: string, reciterId: number): Promise<string | null> {
        const metadataUrl = `${this.audioUrlBase}/${reciterId}/by_ayah/${verseKey}`;
        const cache = await caches.open(this.CACHE_NAME);
        const cachedMetadata = await cache.match(metadataUrl);

        let audioData;
        if (cachedMetadata) {
            const response = await cachedMetadata.json();
            audioData = response?.audio_file || response?.audio || (response?.audio_files && response.audio_files[0]);
        } else {
            try {
                const response = await firstValueFrom(
                    this.http.get<any>(metadataUrl).pipe(
                        timeout(12000),
                        catchError(err => {
                            return of(null);
                        })
                    )
                );
                if (!response) return null;
                audioData = response?.audio_file || response?.audio || (response?.audio_files && response.audio_files[0]);
                try { cache.put(metadataUrl, new Response(JSON.stringify(response))); } catch (e) { }
            } catch (e) { return null; }
        }

        if (!audioData?.url) return null;

        let audioUrl = audioData.url;
        if (audioUrl.startsWith('//')) {
            audioUrl = `https:${audioUrl}`;
        } else if (!audioUrl.startsWith('http')) {
            audioUrl = `https://audio.qurancdn.com/${audioUrl}`;
        }

        const cachedAudio = await cache.match(audioUrl);
        if (cachedAudio) {
            const blob = await cachedAudio.blob();
            return URL.createObjectURL(blob);
        }

        return audioUrl;
    }

    // --- Gapless Optimization: Explicit Next Verse Setting ---
    public setNextVerseToPreload(verseKey: string) {
        // Called by UI when it calculates the true next verse (handling Surah/Page logic)
        this.preloadNextVerse(this.state.value.currentVerseKey || '', this.state.value.reciterId, verseKey);
    }

    private async preloadNextVerse(currentVerseKey: string, reciterId: number, specificNextKey?: string) {
        try {
            let nextVerseKey = specificNextKey;

            // If no specific key provided, try simple +1 logic (fallback)
            if (!nextVerseKey) {
                const parts = currentVerseKey.split(':');
                const surah = parseInt(parts[0]);
                const ayah = parseInt(parts[1]);
                // Fallback within current surah ONLY. 
                // Cross-surah preloading depends on component calling setNextVerseToPreload()
                nextVerseKey = `${surah}:${ayah + 1}`;
            }

            // Don't preload if already holding it
            if (this.nextVerseKey === nextVerseKey) return;

            console.log(`[AudioService] Preloading next verse (Dual Player): ${nextVerseKey}`);

            let urlToFetch = '';
            if (this.RECITER_OVERRIDES[reciterId]) {
                const [nSurah, nAyah] = nextVerseKey.split(':').map(Number);
                const paddedSurah = nSurah.toString().padStart(3, '0');
                const paddedAyah = nAyah.toString().padStart(3, '0');
                urlToFetch = `${this.RECITER_OVERRIDES[reciterId]}/${paddedSurah}${paddedAyah}.mp3`;
            } else {
                urlToFetch = await this.getOrFetchAudioUrl(nextVerseKey, reciterId) || '';
            }

            if (urlToFetch) {
                // DUAL PLAYER: Load directly into the standby player
                this.standbyAudio.src = urlToFetch;
                this.standbyAudio.load();
                this.nextVerseKey = nextVerseKey;
                // We no longer use nextVerseBlobUrl

                console.log(`[AudioService] Standby player primed with ${nextVerseKey}`);

                // Also cache to disk for future session functionality (optimistic)
                // We don't block on this
                try {
                    const cache = await caches.open(this.CACHE_NAME);
                    cache.match(urlToFetch).then(res => {
                        if (!res) {
                            fetch(urlToFetch).then(freshRes => {
                                if (freshRes.ok) cache.put(urlToFetch, freshRes.clone());
                            });
                        }
                    });
                } catch (e) { }
            }
        } catch (e) {
            console.warn('[AudioService] Failed to preload next verse', e);
        }
    }

    private startPrecisionClock(player: HTMLAudioElement) {
        if (this.overlapTimer) return;

        console.log(`[AudioService] Precision Clock Started...`);
        this.overlapTimer = setInterval(() => {
            const s = this.state.value;
            const rem = player.duration - player.currentTime;
            const nextKey = this.nextVerseKey;

            // Precision Overlap Trigger
            if (rem <= this.OVERLAP_TRIGGER_SEC && !this.isGaplessTransitioning) {
                // CRITICAL: Only trigger overlap if it's the LAST repetition of this ayah
                const isLastRepeat = s.currentAyahRepeatCount + 1 >= s.repeatAyah;

                if (isLastRepeat && nextKey && this.standbyAudio.src && this.isWithinRange(nextKey)) {
                    console.log(`[AudioService] Studio Overlap Triggered! Rem: ${rem.toFixed(3)}s`);
                    this.isGaplessTransitioning = true;
                    this.playVerse(nextKey);
                } else if (!isLastRepeat) {
                    // Still repeating - let handleAudioEnded handle the loop
                    // No-op here
                } else if (nextKey && !this.isWithinRange(nextKey)) {
                    // Range reached! stop the timer and let normal end handle it
                    console.log(`[AudioService] Range ending soon (${nextKey} out), disabling precision clock.`);
                    this.stopPrecisionClock();
                }
            }

            // Auto-cleanup if past end or paused
            if (rem <= 0 || player.paused) {
                this.stopPrecisionClock();
            }
        }, this.PRECISION_INTERVAL_MS);
    }

    private stopPrecisionClock() {
        if (this.overlapTimer) {
            clearInterval(this.overlapTimer);
            this.overlapTimer = null;
        }
    }

    private fadePlayer(player: HTMLAudioElement, from: number, to: number, duration: number) {
        const start = Date.now();
        const initialVol = from;
        const diff = to - from;

        const timer = setInterval(() => {
            const elapsed = Date.now() - start;
            const progress = Math.min(1, elapsed / duration);

            player.volume = initialVol + (diff * progress);

            if (progress >= 1) {
                clearInterval(timer);
                if (to === 0) {
                    player.pause();
                    player.currentTime = 0;
                    player.volume = 1; // Reset for next use
                }
            }
        }, 16);
    }

    private isWithinRange(verseKey: string): boolean {
        const s = this.state.value;
        if (!s.playbackRange || !verseKey) return true;

        // If it's quran mode, it's always within range unless we reach the very end (handled by ID < 114 check elsewhere)
        if (s.playbackRange === 'quran') return true;

        const parseKey = (key: string) => {
            const parts = key.split(':').map(Number);
            return (parts[0] || 0) * 1000 + (parts[1] || 0);
        };

        // If we have an explicit boundary, use it
        if (s.rangeEndVerseKey) {
            const currentVal = parseKey(verseKey);
            const endVal = parseKey(s.rangeEndVerseKey);
            const result = currentVal <= endVal;
            console.log(`[AudioService] isWithinRange: ${verseKey}(${currentVal}) <= ${s.rangeEndVerseKey}(${endVal}) -> ${result} (Range: ${s.playbackRange})`);
            return result;
        }

        // Fallback for custom if rangeEndVerseKey wasn't set (structural safety)
        if (s.playbackRange === 'custom' && s.specificRange) {
            const currentVal = parseKey(verseKey);
            const endVal = parseKey(s.specificRange.end);
            const result = currentVal <= endVal;
            console.log(`[AudioService] isWithinRange (Custom fallback): ${verseKey}(${currentVal}) <= ${s.specificRange.end}(${endVal}) -> ${result}`);
            return result;
        }

        return true;
    }
}
