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
    recitationType?: 'ayah' | 'surah';
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
    externalPlaybackControl?: boolean; // When true, service skips internal auto-advance
    isShuffle?: boolean; // NEW: Pick random Surah on completion
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
    private readonly TIMED_RECITERS: number[] = [174, 160, 161]; // Added 160 (Balila) and 161 (Tunaiji) for gapless support
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
        13: 'https://everyayah.com/data/Hudhaify_128kbps',
        85: 'https://everyayah.com/data/Ghamadi_40kbps',
        110: 'https://everyayah.com/data/Abdullah_Basfar_64kbps',
        14: 'https://everyayah.com/data/Muhammad_Ayyoub_128kbps',
        158: 'https://everyayah.com/data/Ali_Jaber_64kbps', // Corrected from Studio path
        159: 'https://everyayah.com/data/MaherAlMuaiqly128kbps',
        174: 'https://everyayah.com/data/Yasser_Ad-Dussary_128kbps',
        161: 'https://everyayah.com/data/khalefa_al_tunaiji_64kbps',
        168: 'https://everyayah.com/data/Minshawy_Teacher_128kbps',
        200: 'https://everyayah.com/data/Yaser_Salamah_128kbps',
        201: 'https://everyayah.com/data/mahmoud_ali_al_banna_32kbps',
        202: 'https://everyayah.com/data/Fares_Abbad_64kbps',
        203: 'https://everyayah.com/data/Hudhaify_128kbps',
        205: 'https://everyayah.com/data/Mustafa_Ismail_48kbps'
    };

    // RECITERS who provide FULL SURAH audio only
    private readonly SURAH_SOURCES: { [key: number]: string } = {
        2001: 'https://server16.mp3quran.net/kamel/Rewayat-Hafs-A-n-Assem/', // Abdullah Kamel
        2002: 'https://server6.mp3quran.net/abkr/', // Idris Abkar
        2003: 'https://server16.mp3quran.net/h_saleh/Rewayat-Hafs-A-n-Assem/', // Hassan Saleh
        2004: 'https://server8.mp3quran.net/wdod/', // Abdul Wadood Hanif
        2005: 'https://server14.mp3quran.net/islam/Rewayat-Hafs-A-n-Assem/', // Islam Sobhi
        2006: 'https://server14.mp3quran.net/mansor/', // Mansour Al-Salimi
        2007: 'https://server6.mp3quran.net/wdee3/', // Wadih Al-Yamani
        2008: 'https://server10.mp3quran.net/jleel/', // Khalid Al-Jaleel
        2009: 'https://server6.mp3quran.net/qtm/', // Nasser Al-Qatami
        2010: 'https://server12.mp3quran.net/maher/', // Maher Al-Muaiqly
        2011: 'https://server6.mp3quran.net/balilah/', // Bandar Balila
        2012: 'https://server12.mp3quran.net/tnjy/', // Khalifa Al-Tunaiji
        2013: 'https://server6.mp3quran.net/kurdi/' // Raad Al-Kurdi
    };

    private readonly SURAH_RECITERS = new Set([2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013]);
    // Instant Preload State
    private nextVerseBlobUrl: string | null = null;
    private nextVerseKey: string | null = null;

    // DOWNLOAD CANCELLATION
    private pendingCancellations: Set<string> = new Set();
    private downloadProgress = new BehaviorSubject<Map<string, number>>(new Map());
    public downloadProgress$ = this.downloadProgress.asObservable();

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
        playbackRange: 'surah',
        externalPlaybackControl: false,
        isShuffle: false
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
    private androidStatusTimer: any = null;


    public state$ = this.state.asObservable();
    public get snapshot(): PlaybackState {
        return this.state.value;
    }

    public isSurahReciter(reciterId: number): boolean {
        return this.SURAH_RECITERS.has(reciterId) || reciterId === 286;
    }
    private verseCompleted = new BehaviorSubject<{ verseKey: string; duration: number } | null>(null);
    public verseCompleted$ = this.verseCompleted.asObservable();
    private currentRepeatCount = 0;
    private maxRepeatCount = 1;

    // ANDROID FIX: Cache last known valid duration to prevent 0s issue
    private lastValidDuration: number = 0;
    public get lastKnownDuration(): number {
        return this.lastValidDuration;
    }

    constructor(
        private http: HttpClient,
        private dataService: MushafDataService
    ) {
        // Restore shuffle mode
        const savedShuffle = localStorage.getItem('audio_shuffle_mode');
        if (savedShuffle !== null) {
            this.updateState({ isShuffle: JSON.parse(savedShuffle) });
        }

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
                MediaBridge.addListener('playbackEnded', async (info: any) => {
                    console.log('[AudioService] MediaBridge playback ended event');
                    // ANDROID FIX: Capture duration from status before handling end
                    try {
                        const status = await MediaBridge.getStatus();
                        if (status.duration > 0) this.lastValidDuration = status.duration / 1000;
                        else if (status.position > 0) this.lastValidDuration = status.position / 1000;
                    } catch (e) { /* ignore */ }
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
            // ANDROID/WEB FIX: Pass the verse key that this SPECIFIC player was playing
            const finishedVerse = (player as any).verseKey;
            this.handleAudioEnded(undefined, finishedVerse);
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

            // ANDROID FIX: Latch valid duration
            if (Number.isFinite(duration) && duration > 0) {
                this.lastValidDuration = duration;
            } else if (this.audio.currentTime > this.lastValidDuration) {
                // Progressive Latch: If duration is unknown, use max seen currentTime
                this.lastValidDuration = this.audio.currentTime;
            }

            if (this.isTimedPlayback && this.currentVerseTiming) {
                const currentTimeMs = player.currentTime * 1000;

                // CRITICAL: Ignore updates if we are in the middle of a gapless transition
                if (!this.isGaplessTransitioning && !player.paused && currentTimeMs >= this.currentVerseTiming.timestamp_to) {
                    if (this.state.value.currentVerseKey === this.currentVerseTiming.verse_key) {
                        this.handleAudioEnded(undefined, this.currentVerseTiming.verse_key);
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
                        position: progress // Use calculated progress (relative for VBV, absolute for Surah)
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
            const error = player.error;
            console.error('[AudioService] Playback Error:', {
                event: e,
                code: error?.code,
                message: error?.message,
                src: player.src
            });
            this.updateState({ isPlaying: false, isBuffering: false });
            this.isPlayingNewAudio = false; // RELEASE mutex on fatal error
        };
    }

    private updateState(partial: Partial<PlaybackState>) {
        this.state.next({ ...this.state.value, ...partial });
    }

    public updatePlaybackState(partial: Partial<PlaybackState>) {
        this.updateState(partial);
    }

    public setExternalPlaybackControl(value: boolean) {
        this.updateState({ externalPlaybackControl: value });
    }

    public seekTo(seconds: number) {
        if (this.audio) {
            this.audio.currentTime = seconds;
            this.updateState({ progress: seconds });
        }
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

    async playVerse(verseKey: string, reciterId?: number, muted?: boolean) {
        // CRITICAL: Aggressive mutex to prevent NativeAudio hammering
        if (this.isPlayingNewAudio) {
            // Already processing - completely ignore this call
            return;
        }

        const now = Date.now();
        const timeDiff = now - this.lastPlayCallTime;
        console.log(`[AudioService DEBUG] playVerse called: ${verseKey} (Reciter: ${reciterId}, Muted: ${muted}), Diff: ${timeDiff}ms, PlayingNew: ${this.isPlayingNewAudio}, CurrentKey: ${this.state.value.currentVerseKey}, IsPlaying: ${this.state.value.isPlaying}`);

        // Extended debounce - prevent rapid re-triggering for same verse (1.5 seconds)
        // BUT: Skip debounce for muted plays (simulation mode needs rapid replays)
        if (!muted && verseKey === this.lastPlayCallVerseKey && timeDiff < 1500) {
            console.log(`[AudioService] Debounced rapid play request for ${verseKey}. Diff was ${timeDiff}ms`);
            return;
        }

        // If currently playing the same verse, ignore (but allow muted to override)
        if (!muted && this.state.value.currentVerseKey === verseKey && this.state.value.isPlaying) {
            console.log(`[AudioService] Already playing ${verseKey}, ignoring duplicate request`);
            return;
        }

        // Set mutex IMMEDIATELY before any async work
        this.isPlayingNewAudio = true;
        this.lastPlayCallVerseKey = verseKey;
        this.lastPlayCallTime = now;
        this.lastValidDuration = 0; // RESET LATCh for new verse

        const rId = reciterId || this.state.value.reciterId;
        console.log(`[AudioService] Playing Verse: ${verseKey}, Reciter: ${rId}`);

        // Cancel any pending operation
        this.currentOperationId++;
        const operationId = this.currentOperationId;

        const wasTimed = this.isTimedPlayback;
        const willBeTimed = this.TIMED_RECITERS.includes(rId);

        // Clear any pending requests - we're handling this one now
        this.pendingPlayRequest = null;

        // Check if we are in "Handover Mode" (Silent audio playing to keep session alive)
        const isUnlockHandover = this.audio.src === this.SILENT_SRC && !this.audio.paused;

        // Stop audio only if switching modes or if current audio is still playing (and NOT in handover)
        if (!isUnlockHandover && (!willBeTimed || wasTimed !== willBeTimed)) {
            await this.stopAudioCompletely();
        } else {
            if (!this.audio.paused && !isUnlockHandover) {
                this.audio.pause();
            }
            if (!isUnlockHandover) this.audio.currentTime = 0;
        }

        // Check if operation was cancelled during stop
        if (operationId !== this.currentOperationId) {
            this.isPlayingNewAudio = false;
            this.isGaplessTransitioning = false;
            return;
        }

        this.isTimedPlayback = willBeTimed;
        this.lastEndTriggeredVerseKey = '';

        // DUAL PLAYER: CHECK SWAP
        const isStandbyReady = this.nextVerseKey === verseKey && this.standbyAudio.src && this.standbyAudio.readyState >= 1;

        if (isStandbyReady) {
            console.log(`[AudioService] STUDIO SWAP (Cross-fade) to Standby for ${verseKey}`);

            const oldActive = this.activeAudio;
            this.activeAudio = this.standbyAudio; // SWAP REFERENCE
            this.activeAudio.loop = false; // CRITICAL: Reset native loop from unlock bridge

            // 1. Fade OUT old player and neutralize it
            this.fadePlayer(oldActive, 1, 0, this.FADE_DURATION_MS).then(() => {
                if (oldActive !== this.activeAudio) {
                    oldActive.pause();
                    oldActive.src = '';
                    oldActive.load();
                }
            });

            (this.activeAudio as any).verseKey = verseKey; // STAMP PLAYER
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
                this.activeAudio.volume = 0; // Start silent for fade in
                await this.activeAudio.play();

                // 2. Fade IN new player (FAST for punchy start) - SKIP if muted
                if (!muted) {
                    this.fadePlayer(this.activeAudio, 0, 1, 50);
                }

                this.isPlayingNewAudio = false;
                this.isGaplessTransitioning = false;
                console.log(`[AudioService] STUDIO SWAP Success: ${verseKey}`);
                this.preloadNextVerse(verseKey, rId); // Trigger next preload on the *new* standby
                return;
            } catch (err) {
                console.error('[AudioService] STUDIO SWAP failed, falling back to standard load', err);
                // Fall through to standard load logic below
                this.activeAudio = oldActive; // Restore reference
            }
        }

        // Standard Load (No Standby Match)
        console.log('[AudioService] Standard loading (no standby match)...');
        this.stopPrecisionClock(); // Ensure timer isn't running for random clicks
        if (!muted) {
            this.activeAudio.volume = 1; // Ensure full volume for fresh starts
        } else {
            this.activeAudio.volume = 0; // Muted for simulation
        }

        (this.activeAudio as any).verseKey = verseKey; // STAMP PLAYER
        this.updateState({ currentVerseKey: verseKey, reciterId: rId, isBuffering: true, currentAyahRepeatCount: 0 });

        // NATIVE OFFLINE CHECK: Check if file exists in filesystem FIRST
        const localResult = await this.getLocalUri(verseKey, rId);
        if (localResult) {
            console.log(`[AudioService] LOCAL PRIORITIZATION: Found local file for ${verseKey}`);
            const audioUrl = Capacitor.getPlatform() === 'android' ? localResult.raw : localResult.converted;

            this.updateMediaSessionMetadata(verseKey, rId);
            this.startForegroundService();

            if (Capacitor.getPlatform() === 'android') {
                try {
                    const reciters = await firstValueFrom(this.getReciters());
                    const reciterName = reciters.find(r => r.id === rId)?.name || 'القارئ';

                    await MediaBridge.play({
                        url: audioUrl,
                        title: `الآية ${verseKey}`,
                        artist: reciterName
                    });
                    this.updateState({ isBuffering: false, isPlaying: true });
                    this.isPlayingNewAudio = false;
                    this.isGaplessTransitioning = false;
                    return;
                } catch (e) {
                    console.error('[AudioService] Native MediaBridge failed for local file, falling back...', e);
                }
            }

            this.audio.src = audioUrl;
            this.audio.load();
            await this.audio.play();
            this.updateState({ isBuffering: false, isPlaying: true });
            this.isPlayingNewAudio = false;
            this.isGaplessTransitioning = false;
            return;
        }

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

            // 1. Check Full Surah Mode (Highest Priority Priority)
            const isSurahMode = this.SURAH_RECITERS.has(rId);
            if (isSurahMode) {
                const [surah] = verseKey.split(':');
                const paddedSurah = surah.padStart(3, '0');
                overrideUrl = `${this.SURAH_SOURCES[rId]}/${paddedSurah}.mp3`;
                console.log(`[AudioService] FULL SURAH MODE for Reciter ${rId}: ${overrideUrl}`);
            }
            // 2. Check Standard Verse Overrides
            else if (this.RECITER_OVERRIDES[rId]) {
                const [surah, ayah] = verseKey.split(':');
                const paddedSurah = surah.padStart(3, '0');
                const paddedAyah = ayah.padStart(3, '0');
                overrideUrl = `${this.RECITER_OVERRIDES[rId]}/${paddedSurah}${paddedAyah}.mp3`;
                console.log(`[AudioService] Using Override URL for Reciter ${rId}: ${overrideUrl}`);
            }

            let audioData;
            // If override exists (either Surah or Verse), skip metadata fetch
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
                        this.updateState({ isBuffering: false, isPlaying: false });
                        this.isPlayingNewAudio = false;
                        this.isGaplessTransitioning = false;
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

                // LOCAL fILE WAS ALREADY CHECKED AT START OF playVerse
                // But for safety/fallback in non-VBV modes if needed:
                const localResult = await this.getLocalUri(verseKey, rId);
                if (localResult) {
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
                        this.startAndroidStatusPolling();

                        // ANDROID FIX: Immediate attempt to capture duration for simulation logic
                        setTimeout(async () => {
                            try {
                                const status = await MediaBridge.getStatus();
                                if (status.duration > 0) this.lastValidDuration = status.duration / 1000;
                            } catch (e) { /* ignore */ }
                        }, 500);

                        // We still use currentVerseKey for UI tracking
                        this.preloadNextVerse(verseKey, rId);
                        return;
                    } catch (bridgeError) {
                        console.error('[AudioService] MediaBridge play failed, falling back to HTML5:', bridgeError);
                        // Fallback to HTML5 if bridge fails
                        this.audio.src = localResult?.converted || audioUrl;
                        this.audio.loop = false;
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
                        this.isGaplessTransitioning = false;
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
                        this.isGaplessTransitioning = false;
                        this.preloadNextVerse(verseKey, rId);

                    } catch (nativeError) {
                        console.error('[AudioService] Native Audio failed:', nativeError);
                        this.updateState({ isBuffering: false, isPlaying: false });
                        this.isPlayingNewAudio = false;
                        this.isGaplessTransitioning = false;
                    }
                    this.isPlayingNewAudio = false;
                    this.isGaplessTransitioning = false;
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
                    this.audio.loop = false; // Reset unlocking loop
                    await this.audio.play();
                    console.log('[AudioService] Playback started successfully');
                    this.isPlayingNewAudio = false;
                    this.isGaplessTransitioning = false;
                    // CRITICAL FIX: Preload next verse after standard load completes
                    this.preloadNextVerse(verseKey, rId);
                } catch (playError) {
                    console.error('[AudioService] Playback failed/blocked:', playError);
                    this.isPlayingNewAudio = false;
                    this.isGaplessTransitioning = false;
                    this.updateState({ isPlaying: false, isBuffering: false });
                }
            } else {
                console.warn(`[AudioService] No audio URL found for ${rId}/${verseKey}`);
                if (audioData) {
                    console.error('[AudioService] Invalid Audio Data structure:', audioData);
                }
                this.updateState({ isBuffering: false, isPlaying: false });
                this.isPlayingNewAudio = false;
                this.isGaplessTransitioning = false;
            }
        } catch (error) {
            console.error(`[AudioService] Error in playVerse for ${verseKey}:`, error);
            this.updateState({ isBuffering: false, isPlaying: false });
            this.isPlayingNewAudio = false;
            this.isGaplessTransitioning = false;
        }
    }

    async pause() {
        this.userExplicitlyPaused = true;

        if (Capacitor.getPlatform() === 'android') {
            MediaBridge.pause().catch(() => { });
            this.stopAndroidStatusPolling();
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
            this.startAndroidStatusPolling();
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
            this.stopAndroidStatusPolling();
        }

        this.stopAudioCompletely();
        this.stopForegroundService();
        // CRITICAL: Set currentVerseKey to null to tell UI that the session is OVER.
        // This resets the "Play" button to its initial state (opening options).
        this.updateState({ isPlaying: false, progress: 0, isBuffering: false, currentVerseKey: null });
    }

    async stopAudioCompletely() {
        this.stopPrecisionClock();

        // ANDROID FIX: Stop MediaBridge playback immediately
        if (Capacitor.getPlatform() === 'android') {
            MediaBridge.stop().catch(() => { });
            this.stopAndroidStatusPolling();
        }

        // Stop BOTH HTML5 players to prevent overlaps during swaps/reciter changes
        [this.audioPrimary, this.audioSecondary].forEach(p => {
            p.pause();
            p.currentTime = 0;
            p.removeAttribute('src');
            // Trigger load to clear buffer
            try { p.load(); } catch (e) { }
        });

        if (this.currentObjectURL) {
            URL.revokeObjectURL(this.currentObjectURL);
            this.currentObjectURL = null;
        }

        if (this.useNativeAudio) {
            if (this.activeNativeAssetId) {
                await NativeAudio.stop({ assetId: this.activeNativeAssetId }).catch(() => { });
                await NativeAudio.unload({ assetId: this.activeNativeAssetId }).catch(() => { });
                this.activeNativeAssetId = null;
            }
        }
    }

    private startAndroidStatusPolling() {
        this.stopAndroidStatusPolling();
        if (Capacitor.getPlatform() !== 'android') return;

        this.androidStatusTimer = setInterval(async () => {
            try {
                const status = await MediaBridge.getStatus();
                if (status.duration > 0) {
                    this.lastValidDuration = status.duration / 1000;
                    this.updateState({
                        progress: status.position / 1000,
                        duration: status.duration / 1000
                    });
                }
            } catch (e) {
                console.warn('[AudioService] Android status polling error:', e);
            }
        }, 800);
    }

    private stopAndroidStatusPolling() {
        if (this.androidStatusTimer) {
            clearInterval(this.androidStatusTimer);
            this.androidStatusTimer = null;
        }
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

    setShuffle(enabled: boolean) {
        this.updateState({ isShuffle: enabled });
        localStorage.setItem('audio_shuffle_mode', JSON.stringify(enabled));
    }

    /**
     * Unlock audio context for Android/iOS autoplay restrictions.
     * Must be called on a direct user gesture (e.g., button click).
     * This allows subsequent programmatic audio.play() calls to work.
     */
    async unlockAudio(): Promise<void> {
        try {
            // BLESS ACTUAL ELEMENTS: Interact with the REAL players synchronously
            // This tells Android "User authorized these specific elements"
            const players = [this.audioPrimary, this.audioSecondary];

            const promises = players.map(async (p) => {
                // If src is empty, set it to silent audio so play() works
                if (!p.src || p.src === '') {
                    p.src = this.SILENT_SRC;
                }

                // Set volume low to avoid popping
                const originalVol = p.volume;
                p.volume = 0; // Absolute silence for the bridge

                // Play and KEEP PLAYING (Loop) to maintain session during async fetch
                try {
                    p.loop = true;
                    await p.play();
                    // Do NOT pause. Leaving it playing bridges the 'async gap'.
                    // playVerse will handle stopping/swapping src.
                } catch (error) {
                    console.warn('[AudioService] Unlock attempt failed for player:', error);
                } finally {
                    // Restore volume target (actual volume will be set by playVerse)
                    p.volume = originalVol;
                }
            });

            await Promise.all(promises);
            console.log('[AudioService] Audio context unlocked (Blessed Primary & Secondary - Handover Mode).');
        } catch (e) {
            console.warn('[AudioService] Audio unlock critical error:', e);
        }
    }

    private async handleAudioEnded(sourceAssetId?: string, sourceVerseKey?: string) {
        // ANDROID FIX: Force Latch valid duration at end if missed
        // This ensures the first verse has a duration for simulation wait logic
        if (this.lastValidDuration === 0) {
            const d = this.audio.duration;
            if (Number.isFinite(d) && d > 0) {
                this.lastValidDuration = d;
            } else if (this.audio.currentTime > 0) {
                this.lastValidDuration = this.audio.currentTime;
            }
        }

        // Stop polling when verse ends
        this.stopAndroidStatusPolling();

        const s = this.state.value;

        // VERSE VALIDATION
        const effectiveVerseKey = sourceVerseKey || s.currentVerseKey;

        if (this.useNativeAudio && !this.isTimedPlayback && sourceAssetId) {
            const currentAssetId = `verse_${s.currentVerseKey?.replace(':', '_')}`;
            if (sourceAssetId !== currentAssetId) {
                console.log(`[AudioService] Ignoring handleAudioEnded for stale asset: ${sourceAssetId} (current: ${currentAssetId})`);
                return;
            }
        }

        // HTML5 VERSE VALIDATION (Race Condition Guard)
        // If we have a specific verse key from the source, it MUST match either the current or the last triggered
        if (sourceVerseKey && s.currentVerseKey && sourceVerseKey !== s.currentVerseKey) {
            if (sourceVerseKey === this.lastEndTriggeredVerseKey) {
                console.warn(`[AudioService] Signal for ${sourceVerseKey} already processed. Ignoring duplicate.`);
                return;
            }
            console.log(`[AudioService] Processing end signal for previous verse: ${sourceVerseKey}`);
        }

        if (this.isPlayingNewAudio && !sourceVerseKey) {
            console.log('[AudioService] Ignoring handleAudioEnded - new audio loading without source context');
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

        // 1. Ayah Repetition (Skip if external control is active)
        if (!s.externalPlaybackControl && s.repeatAyah > 1 && s.currentAyahRepeatCount + 1 < s.repeatAyah) {
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
        // CRITICAL: Skip if externalPlaybackControl is true (memorization mode)
        if (s.externalPlaybackControl) {
            console.log('[AudioService] External control active, skipping internal auto-advance.');
            // Fall through to step 3 (notify verseCompleted)
        } else if (s.currentVerseKey && s.currentVerseKey !== this.lastEndTriggeredVerseKey) {
            const nextKey = this.nextVerseKey;

            // CRITICAL: Check if nextKey is within boundaries
            if (nextKey && this.standbyAudio.src && this.isWithinRange(nextKey)) {
                console.log(`[AudioService] Auto-advancing internally to ${nextKey}`);
                this.playVerse(nextKey); // Trigger swap and play
                return; // Transition handled internally
            } else if (nextKey && !this.isWithinRange(nextKey)) {
                // Truly out of range -> handle group repetitions or stop
                if (!s.externalPlaybackControl && s.repeatGroup > 1 && s.currentGroupRepeatCount + 1 < s.repeatGroup) {
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

        // 3. Smart Shuffle: If Surah ended and Shuffle is ON, notify component to pick random
        if (s.isShuffle && effectiveVerseKey) {
            const [surahId, ayahNum] = effectiveVerseKey.split(':').map(Number);
            // We need metadata to know if it's the last ayah, but service doesn't have easy access to surah lengths for all 114 here without fetching.
            // Component already handles shuffle in playNextVerseAudio.
            // Here we just ensure we NOTIFY the component via verseCompleted.
        }

        // 4. Clear Ayah Repeat count and notify completion to advance
        if (effectiveVerseKey && effectiveVerseKey !== this.lastEndTriggeredVerseKey) {
            console.log(`[AudioService] Verse ${effectiveVerseKey} completed. Notifying advance. (Range: ${s.playbackRange})`);
            this.lastEndTriggeredVerseKey = effectiveVerseKey;
            this.updateState({ currentAyahRepeatCount: 0 });
            this.verseCompleted.next({ verseKey: effectiveVerseKey, duration: this.lastValidDuration });
        } else {
            console.log(`[AudioService] Verse already notified or no key: ${effectiveVerseKey}`);
            this.updateState({ currentAyahRepeatCount: 0 });
        }
    }

    private normalizeArabicName(name: string): string {
        if (!name) return '';
        // Remove common prefixes for sorting only
        let normalized = name.replace(/^(الشيخ\s+|القارئ\s+|الـ)/g, '');
        return normalized.trim();
    }

    getReciters(): Observable<Reciter[]> {
        const CACHE_KEY = 'cached_reciters_list_v16';
        const cached = localStorage.getItem(CACHE_KEY);

        const missingReciters: Reciter[] = [
            // Standard Quran.com IDs for high-reliability fallback
            { id: 1, name: 'عبد الباسط عبد الصمد (مجود)', style: 'مجود', recitationType: 'ayah' },
            { id: 2, name: 'عبد الباسط عبد الصمد (مرتل)', style: 'مرتل', recitationType: 'ayah' },
            { id: 3, name: 'عبد الرحمن السديس', style: 'مرتل', recitationType: 'ayah' },
            { id: 4, name: 'أبو بكر الشاطري', style: 'مرتل', recitationType: 'ayah' },
            { id: 5, name: 'هاني الرفاعي', style: 'مرتل', recitationType: 'ayah' },
            { id: 6, name: 'محمود خليل الحصري (مرتل)', style: 'مرتل', recitationType: 'ayah' },
            { id: 12, name: 'محمود خليل الحصري (المعلم)', style: 'المعلم', recitationType: 'ayah' },
            { id: 7, name: 'مشاري العفاسي', style: 'مرتل', recitationType: 'ayah' },
            { id: 8, name: 'محمد صديق المنشاوي (مجود)', style: 'مجود', recitationType: 'ayah' },
            { id: 9, name: 'محمد صديق المنشاوي (مرتل)', style: 'مرتل', recitationType: 'ayah' },
            { id: 10, name: 'سعود الشريم', style: 'مرتل', recitationType: 'ayah' },
            { id: 11, name: 'محمد الطبلاوي', style: 'مرتل', recitationType: 'ayah' },
            { id: 13, name: 'علي عبد الرحمن الحذيفي', style: 'مرتل', recitationType: 'ayah' },
            { id: 85, name: 'سعد الغامدي', style: 'مرتل', recitationType: 'ayah' },
            { id: 110, name: 'عبد الله بصفر', style: 'مرتل', recitationType: 'ayah' },
            { id: 14, name: 'محمد أيوب', style: 'مرتل', recitationType: 'ayah' },
            { id: 174, name: 'ياسر الدوسري', style: 'مرتل', recitationType: 'ayah' },
            { id: 159, name: 'ماهر المعيقلي', style: 'مرتل', recitationType: 'ayah' },
            { id: 19, name: 'أحمد بن علي العجمي', style: 'مرتل', recitationType: 'ayah' },
            { id: 158, name: 'عبدالله علي جابر', style: 'مرتل', recitationType: 'ayah' },
            { id: 161, name: 'خليفة الطنيجي (آيات)', style: 'مرتل', recitationType: 'ayah' },
            { id: 160, name: 'بندر بليلة (آيات)', style: 'مرتل', recitationType: 'ayah' },
            { id: 175, name: 'عبدالله حمد أبو شريدة', style: 'مرتل', recitationType: 'ayah' },
            { id: 168, name: 'محمد صديق المنشاوي (بترديد الأطفال)', style: 'بترديد الأطفال', recitationType: 'ayah' },
            { id: 200, name: 'ياسر سلامة', style: 'حدر', recitationType: 'ayah' },
            { id: 201, name: 'محمود علي البنا', style: 'مرتل', recitationType: 'ayah' },
            { id: 202, name: 'فارس عباد', style: 'مرتل', recitationType: 'ayah' },
            { id: 205, name: 'مصطفى إسماعيل', style: 'مرتل', recitationType: 'ayah' },
            // FULL SURAH RECITERS (2000+)
            { id: 2001, name: 'عبدالله كامل ', style: 'مرتل', recitationType: 'surah' },
            { id: 2002, name: 'إدريس أبكر ', style: 'مرتل', recitationType: 'surah' },
            { id: 2003, name: 'حسن صالح ', style: 'مرتل', recitationType: 'surah' },
            { id: 2004, name: 'عبدالودود حنيف ', style: 'مرتل', recitationType: 'surah' },
            { id: 2005, name: 'إسلام صبحي ', style: 'مرتل', recitationType: 'surah' },
            { id: 2006, name: 'منصور السالمي ', style: 'مرتل', recitationType: 'surah' },
            { id: 2007, name: 'وديع اليمني ', style: 'مرتل', recitationType: 'surah' },
            { id: 2008, name: 'خالد الجليل ', style: 'مرتل', recitationType: 'surah' },
            { id: 2009, name: 'ناصر القطامي ', style: 'مرتل', recitationType: 'surah' },
            { id: 2010, name: 'ماهر المعيقلي ', style: 'مرتل', recitationType: 'surah' },
            { id: 2011, name: 'بندر بليلة ', style: 'مرتل', recitationType: 'surah' },
            { id: 2012, name: 'خليفة الطنيجي ', style: 'مرتل', recitationType: 'surah' },
            { id: 2013, name: 'رعد الكردي ', style: 'مرتل', recitationType: 'surah' }
        ];

        const fetchAndCache = this.http.get<any>('https://api.quran.com/api/v4/resources/recitations?language=ar&per_page=500').pipe(
            map(res => {
                let reciters = res.recitations.map((r: any) => ({
                    id: r.id,
                    name: r.translated_name?.name || r.reciter_name,
                    style: r.style,
                    recitationType: 'ayah' as const
                }));

                missingReciters.forEach(mr => {
                    const existing = reciters.find((r: any) => r.id === mr.id);
                    if (!existing) {
                        reciters.push(mr);
                    } else {
                        // Ensure even existing ones get their type if they're in our special list
                        existing.recitationType = mr.recitationType;
                        // Prefer our descriptive names for special reciters
                        if (mr.name.includes('')) {
                            existing.name = mr.name;
                        }
                    }
                });

                // Sort alphabetically by name (Arabic locale)
                return reciters.sort((a: Reciter, b: Reciter) => {
                    return this.normalizeArabicName(a.name).localeCompare(this.normalizeArabicName(b.name), 'ar');
                });
            }),
            tap((reciters: Reciter[]) => {
                localStorage.setItem(CACHE_KEY, JSON.stringify(reciters));
            }),
            catchError(err => {
                console.error('[AudioService] Failed to fetch reciters, returning defaults', err);
                const sortedDefaults = [...missingReciters].sort((a: Reciter, b: Reciter) => {
                    return this.normalizeArabicName(a.name).localeCompare(this.normalizeArabicName(b.name), 'ar');
                });
                return of(sortedDefaults);
            })
        );

        if (cached) {
            try {
                return of(JSON.parse(cached) as Reciter[]);
            } catch (e) {
                return fetchAndCache;
            }
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

            // --- NATIVE OFFLINE CHECK FOR TIMED AUDIO (SURAH LEVEL) ---
            const localSurahFile = await this.getLocalUri('full', reciterId, surahId);
            if (localSurahFile) {
                console.log(`[AudioService] LOCAL PRIORITIZATION: Found local FULL file for Surah ${surahId}`);
                this.audio.src = localSurahFile.converted;
                this.audio.load();
                // We still need timings to navigate verses within the file
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

                    // OFFLINE CHECK for Timed Audio (Already done at start of method, but handle timings load here)
                    const localResult = await this.getLocalUri('full', reciterId, surahId);

                    const cachedAudio = await cache.match(audioUrl);
                    if (localResult) {
                        // Already set src above, but ensure it's correct
                        if (this.audio.src !== localResult.converted) {
                            this.audio.src = localResult.converted;
                            this.audio.load();
                        }
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
                this.audio.currentTime = targetTime;
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



    async cancelDownload(surahId: number, reciterId: number): Promise<void> {
        const key = `${reciterId}-${surahId}`;
        this.pendingCancellations.add(key);
        // Clear progress on cancel
        const currentProgress = this.downloadProgress.value;
        currentProgress.delete(key);
        this.downloadProgress.next(currentProgress);
        console.log(`[AudioService] Cancellation requested for: ${key}`);
    }

    async deleteSurah(surahId: number, reciterId: number): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        try {
            const path = `audio/${reciterId}/${surahId}`;
            await Filesystem.rmdir({
                directory: Directory.Data,
                path: path,
                recursive: true
            });

            // Remove marker from cache
            const cache = await caches.open(this.CACHE_NAME);
            const markerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
            await cache.delete(markerUrl);

            console.log(`[AudioService] Deleted Surah ${surahId} for reciter ${reciterId}`);
        } catch (e) {
            console.error('[AudioService] Failed to delete surah:', e);
            throw e;
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
        const cancellationKey = `${reciterId}-${surahId}`;
        this.pendingCancellations.delete(cancellationKey); // Reset if exists

        // Initialize progress
        const currentProgressMap = this.downloadProgress.value;
        currentProgressMap.set(cancellationKey, 0);
        this.downloadProgress.next(currentProgressMap);

        const updateProgress = (pct: number) => {
            const map = this.downloadProgress.value;
            map.set(cancellationKey, Math.floor(pct));
            this.downloadProgress.next(map);
        };

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

                updateProgress(10);
                await Filesystem.downloadFile({
                    url: audioUrl,
                    directory: Directory.Data,
                    path: fileName
                });
                updateProgress(80);

                // Fetch Timings (via proxy)
                const timingsRes = await firstValueFrom(this.http.get<any>(timingsUrl).pipe(timeout(30000)));
                if (timingsRes?.audio_files?.[0]) {
                    await cache.put(timingsUrl, new Response(JSON.stringify(timingsRes)));
                }

                // Marker
                const v4MarkerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
                await cache.put(v4MarkerUrl, new Response(JSON.stringify({ downloaded: true })));

                updateProgress(100);
                console.log(`[AudioService] Abu Sharida download complete: Surah ${surahId}`);
                this.clearProgress(cancellationKey);
                return;
            } catch (e) {
                console.error('[AudioService] Abu Sharida download failed:', e);
                this.clearProgress(cancellationKey);
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

            updateProgress(20);
            await Filesystem.downloadFile({
                url: audioUrl,
                directory: Directory.Data,
                path: fileName
            });

            if (this.pendingCancellations.has(cancellationKey)) {
                this.pendingCancellations.delete(cancellationKey);
                this.clearProgress(cancellationKey);
                console.log('[AudioService] Timed download cancelled after file fetch.');
                return;
            }

            updateProgress(80);
            // Cache Timings only AFTER audio is successful (Keep in Web Cache for timing lookups)
            await cache.put(timingsUrl, new Response(JSON.stringify(timingsRes)));

            // Also cache v4 marker for isSurahCached calls from other places
            const v4MarkerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
            await cache.put(v4MarkerUrl, new Response(JSON.stringify({ downloaded: true })));

            updateProgress(100);
            console.log(`[AudioService] Timed download complete: Surah ${surahId}`);
            this.clearProgress(cancellationKey);
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

            const totalAyat = audioFiles.length;
            let downloadedCount = 0;

            for (const item of audioFiles) {
                // Check for cancellation at each ayah
                if (this.pendingCancellations.has(cancellationKey)) {
                    this.pendingCancellations.delete(cancellationKey);
                    this.clearProgress(cancellationKey);
                    console.log(`[AudioService] Verse download cancelled at ayah ${item.verse_key}`);
                    return;
                }

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

                downloadedCount++;
                updateProgress((downloadedCount / totalAyat) * 100);

                // --- FAKE METADATA INJECTION ---
                const ayahMetadataUrl = `${this.audioUrlBase}/${reciterId}/by_ayah/${item.verse_key}`;
                const ayahMetadata = { audio_file: { ...item, url: audioUrl } };
                await cache.put(ayahMetadataUrl, new Response(JSON.stringify(ayahMetadata)));
            }

            // Only cache chapter metadata AFTER success
            if (successCount > 0) {
                const finalMeta = metaResponse || { audio_files: audioFiles, downloaded: true };
                await cache.put(metadataUrl, new Response(JSON.stringify(finalMeta)));
            }

            updateProgress(100);
            console.log(`[AudioService] Verse download complete: Surah ${surahId}, success: ${successCount}`);
            this.clearProgress(cancellationKey);
        } catch (error) {
            console.error(`[AudioService] Download failed for Surah ${surahId}:`, error);
            this.clearProgress(cancellationKey);
            throw error;
        }
    }

    private clearProgress(key: string) {
        setTimeout(() => {
            const map = this.downloadProgress.value;
            map.delete(key);
            this.downloadProgress.next(map);
        }, 3000);
    }

    private async ensureDirectory(path: string) {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await Filesystem.mkdir({
                directory: Directory.Data,
                path: path,
                recursive: true
            });
        } catch (e) {
            // Usually means directory already exists
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
        // --- LOCAL CHECK FIRST ---
        const localFile = await this.getLocalUri(verseKey, reciterId);
        if (localFile) {
            return localFile.converted;
        }

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

        this.overlapTimer = setInterval(() => {
            const s = this.state.value;
            let rem = player.duration - player.currentTime;

            // Robust check for Android/Mobile where duration might be Infinity/NaN during load
            if (!Number.isFinite(player.duration)) {
                rem = 999; // Assume plenty of time remaining if duration is unknown
            } else if (!Number.isFinite(rem)) {
                rem = 0; // Fallback if calculation fails
            }

            const nextKey = this.nextVerseKey;

            // Precision Overlap Trigger
            // CRITICAL: Skip overlap when external control is active (memorization mode uses its own logic)
            if (rem <= this.OVERLAP_TRIGGER_SEC && !this.isGaplessTransitioning && !s.externalPlaybackControl) {
                // CRITICAL: Only trigger overlap if it's the LAST repetition of this ayah
                const isLastRepeat = s.currentAyahRepeatCount + 1 >= s.repeatAyah;

                if (isLastRepeat && nextKey && this.standbyAudio.src && this.isWithinRange(nextKey)) {
                    this.isGaplessTransitioning = true;
                    this.playVerse(nextKey);
                } else if (!isLastRepeat) {
                    // Still repeating - let handleAudioEnded handle the loop
                    // No-op here
                } else if (nextKey && !this.isWithinRange(nextKey)) {
                    // Range reached! stop the timer and let normal end handle it
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

    private fadePlayer(player: HTMLAudioElement, from: number, to: number, duration: number): Promise<void> {
        return new Promise((resolve) => {
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
                    resolve();
                }
            }, 16);
        });
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
            return currentVal <= endVal;
        }

        // Fallback for custom if rangeEndVerseKey wasn't set (structural safety)
        if (s.playbackRange === 'custom' && s.specificRange) {
            const currentVal = parseKey(verseKey);
            const endVal = parseKey(s.specificRange.end);
            return currentVal <= endVal;
        }

        return true;
    }
}
