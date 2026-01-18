import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, firstValueFrom, timeout, catchError, of, throwError, tap } from 'rxjs';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Capacitor } from '@capacitor/core';

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
    playbackRange: 'surah' | 'page' | 'juz' | 'quran' | 'single';
}

@Injectable({
    providedIn: 'root'
})
export class QuranAudioService {
    private audio = new Audio();
    private readonly SILENT_SRC = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    private audioUrlBase = 'https://api.quran.com/api/v4/recitations';
    private qdcAudioUrlBase = 'https://api.quran.com/api/qdc/audio/reciters';
    private readonly CACHE_NAME = 'quran-audio-v1';
    private currentObjectURL: string | null = null;
    private foregroundServiceId = 101;
    private readonly CHANNEL_ID = 'quran_playback_channel_silent';
    private userExplicitlyPaused = false;
    private wasInterrupted = false;

    private readonly TIMED_RECITERS = [174, 159, 19, 158, 13, 160, 175, 161, 168]; // Reciters that use surah-level timed segments
    private currentSurahTimings: VerseTiming[] = [];
    private currentTimedReciterId: number | null = null;
    private currentVerseTiming: VerseTiming | null = null;
    private isTimedPlayback = false;
    private lastEndTriggeredVerseKey = '';
    private isPlayingNewAudio = false; // Flag to track if new audio is being loaded
    private pendingPlayRequest: { verseKey: string; reciterId: number } | null = null; // Track pending play requests

    private state = new BehaviorSubject<PlaybackState>({
        isPlaying: false,
        currentVerseKey: null,
        reciterId: 12, // Default: Al-Husary (Muallim)
        progress: 0,
        duration: 0,
        isBuffering: false,
        playbackRate: 1.0,
        repeatAyah: 0,
        repeatGroup: 0,
        currentAyahRepeatCount: 0,
        currentGroupRepeatCount: 0,
        playbackRange: 'page'
    });

    public state$ = this.state.asObservable();
    public get snapshot(): PlaybackState {
        return this.state.value;
    }
    private verseCompleted = new BehaviorSubject<string | null>(null);
    public verseCompleted$ = this.verseCompleted.asObservable();
    private currentRepeatCount = 0;
    private maxRepeatCount = 1;

    constructor(private http: HttpClient) {
        this.setupMediaSession();
        this.setupAudioListeners();
        this.setupForegroundServiceListeners();
        this.createNotificationChannel();
        this.setupInterruptionHandling();
    }

    private setupInterruptionHandling() {
        // Resume on app focus if it was interrupted
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.wasInterrupted) {
                console.log('[AudioService] App became visible, resuming interrupted audio...');
                this.resume();
            }
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
                importance: 2 // IMPORTANCE_LOW (No sound, no popup)
            });
        } catch (e) {
            console.error('[AudioService] Failed to create notification channel', e);
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
        if (Capacitor.getPlatform() !== 'android') return;

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
                smallIcon: 'ic_launcher_foreground',
                notificationChannelId: this.CHANNEL_ID, // Use our silent channel
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
        this.audio.onplay = () => {
            this.updateState({ isPlaying: true });
            this.startForegroundService();
        };
        this.audio.onpause = () => {
            this.updateState({ isPlaying: false });

            if (!this.userExplicitlyPaused) {
                console.log('[AudioService] Audio paused by system/interruption. Marking for resume.');
                this.wasInterrupted = true;
            }
        };
        this.audio.onended = () => this.handleAudioEnded();
        this.audio.ontimeupdate = () => {
            if (this.audio.playbackRate !== this.state.value.playbackRate) {
                this.audio.playbackRate = this.state.value.playbackRate;
            }

            let progress = this.audio.currentTime;
            let duration = this.audio.duration || 0;

            if (this.isTimedPlayback && this.currentVerseTiming) {
                const currentTimeMs = this.audio.currentTime * 1000;

                // If we passed the end of the segment, trigger handleAudioEnded
                // Uset strict check without buffer to prevent early cutting
                if (!this.audio.paused && currentTimeMs >= this.currentVerseTiming.timestamp_to) {
                    // Double check to avoid erratic triggers
                    if (this.state.value.currentVerseKey === this.currentVerseTiming.verse_key) {
                        this.handleAudioEnded();
                    }
                }

                // Adjust progress/duration for UI to be verse-relative
                progress = Math.max(0, this.audio.currentTime - (this.currentVerseTiming.timestamp_from / 1000));
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
                        playbackRate: this.audio.playbackRate,
                        position: this.audio.currentTime
                    });
                } catch (e) { /* ignore */ }
            }
        };
        this.audio.onwaiting = () => {
            // console.log('[AudioService] Buffering...');
            this.updateState({ isBuffering: true });
        };
        this.audio.onplaying = () => {
            // console.log('[AudioService] Playing...');
            this.updateState({ isBuffering: false, isPlaying: true });
        };
        this.audio.oncanplay = () => {
            // console.log('[AudioService] Can play...');
            this.updateState({ isBuffering: false });
        };
        this.audio.onstalled = () => {
            // console.warn('[AudioService] Stalled...');
            this.updateState({ isBuffering: true });
        };
        this.audio.onerror = (e) => {
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

    async playVerse(verseKey: string, reciterId?: number) {
        this.userExplicitlyPaused = false;
        this.wasInterrupted = false;
        const rId = reciterId || this.state.value.reciterId;
        console.log(`[AudioService] Playing Verse: ${verseKey}, Reciter: ${rId}`);

        const wasTimed = this.isTimedPlayback;
        const willBeTimed = this.TIMED_RECITERS.includes(rId);

        // If there's already a play request in progress, queue this one
        if (this.isPlayingNewAudio) {
            console.log(`[AudioService] Audio loading in progress, queueing request for ${verseKey}`);
            this.pendingPlayRequest = { verseKey, reciterId: rId };
            return;
        }

        // Stop audio only if switching modes or if current audio is still playing
        // For continuous playback of same type, stop immediately without delay
        if (!willBeTimed || wasTimed !== willBeTimed) {
            await this.stopAudioCompletely();
        } else {
            // For timed playback, we intentionally DO NOT stop/pause here.
            // We pass control to playTimedVerse which determines if it's a gapless transition (same surah)
            // or if a stop is needed (diff surah).
            // This enables continuous looping/recitation without "hiccups".
        }

        this.isPlayingNewAudio = true;
        this.isTimedPlayback = willBeTimed;

        this.lastEndTriggeredVerseKey = '';
        this.updateState({ currentVerseKey: verseKey, reciterId: rId, isBuffering: true, currentAyahRepeatCount: 0 });
        this.updateMediaSessionMetadata(verseKey, rId);

        if (this.isTimedPlayback) {
            return this.playTimedVerse(verseKey, rId);
        }

        // If switching to non-timed playback, reset surah-level timings
        this.currentTimedReciterId = null;
        this.currentSurahTimings = [];

        try {
            // Ensure preloading is effective by using the same fetch logic
            const audioUrl = await this.getOrFetchAudioUrl(verseKey, rId);

            if (audioUrl) {
                console.log('[AudioService] Final Audio URL:', audioUrl);

                if (this.currentObjectURL && this.currentObjectURL !== audioUrl) {
                    URL.revokeObjectURL(this.currentObjectURL);
                    this.currentObjectURL = null;
                }

                if (audioUrl.startsWith('blob:')) {
                    this.currentObjectURL = audioUrl;
                }

                this.audio.src = audioUrl;
                this.audio.load();
                this.audio.playbackRate = this.state.value.playbackRate;

                try {
                    await this.waitForAudioReady();
                    await this.audio.play();
                    console.log('[AudioService] Playback started successfully');
                    this.isPlayingNewAudio = false;
                    this.preloadNextVerse(verseKey, rId);
                } catch (playError) {
                    console.error('[AudioService] Playback failed/blocked:', playError);
                    if (this.audio.src.includes('audio.qurancdn.com') && !this.isTimedPlayback) {
                        const fallbackUrl = this.audio.src.replace('audio.qurancdn.com', 'download.quranicaudio.com/quran');
                        this.audio.src = fallbackUrl;
                        this.audio.load();
                        try {
                            await this.waitForAudioReady();
                            await this.audio.play();
                            this.isPlayingNewAudio = false;
                        } catch (e) {
                            this.isPlayingNewAudio = false;
                            this.updateState({ isPlaying: false, isBuffering: false });
                        }
                    } else {
                        this.isPlayingNewAudio = false;
                        this.updateState({ isPlaying: false, isBuffering: false });
                    }
                }
            } else {
                this.updateState({ isBuffering: false, isPlaying: false });
                this.isPlayingNewAudio = false;
            }
        } catch (error) {
            this.updateState({ isBuffering: false, isPlaying: false });
            this.isPlayingNewAudio = false;
        }

        if (this.pendingPlayRequest) {
            const pending = this.pendingPlayRequest;
            this.pendingPlayRequest = null;
            this.playVerse(pending.verseKey, pending.reciterId);
        }
    }

    private async playVerse_OLD_UNUSED(verseKey: string, reciterId?: number) {
        const rId = reciterId || this.state.value.reciterId;
        console.log(`[AudioService] Playing Verse: ${verseKey}, Reciter: ${rId}`);

        const wasTimed = this.isTimedPlayback;
        const willBeTimed = this.TIMED_RECITERS.includes(rId);

        // If there's already a play request in progress, queue this one
        if (this.isPlayingNewAudio) {
            console.log(`[AudioService] Audio loading in progress, queueing request for ${verseKey}`);
            this.pendingPlayRequest = { verseKey, reciterId: rId };
            return;
        }

        // Stop audio only if switching modes or if current audio is still playing
        // For continuous playback of same type, stop immediately without delay
        if (!willBeTimed || wasTimed !== willBeTimed) {
            await this.stopAudioCompletely();
        } else {
            // For same playback type (non-timed), just pause immediately for faster transition
            if (!this.audio.paused) {
                this.audio.pause();
            }
            this.audio.currentTime = 0;
        }

        this.isPlayingNewAudio = true;
        this.isTimedPlayback = willBeTimed;

        this.lastEndTriggeredVerseKey = '';
        this.updateState({ currentVerseKey: verseKey, reciterId: rId, isBuffering: true, currentAyahRepeatCount: 0 });

        if (this.isTimedPlayback) {
            return this.playTimedVerse(verseKey, rId);
        }

        // If switching to non-timed playback, reset surah-level timings
        this.currentTimedReciterId = null;
        this.currentSurahTimings = [];

        try {
            const metadataUrl = `${this.audioUrlBase}/${rId}/by_ayah/${verseKey}`;
            const cache = await caches.open(this.CACHE_NAME);
            const cachedMetadata = await cache.match(metadataUrl);

            let audioData;
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

                if (!response) {
                    console.warn('[AudioService] Empty response or timeout');
                    this.updateState({ isBuffering: false, isPlaying: false });
                    return;
                }
                audioData = response?.audio_file || response?.audio || (response?.audio_files && response.audio_files[0]);

                // Optional: cache individual metadata for future
                try { cache.put(metadataUrl, new Response(JSON.stringify(response))); } catch (e) { }
            }

            if (audioData?.url) {
                let audioUrl = audioData.url;
                if (audioUrl.startsWith('//')) {
                    audioUrl = `https:${audioUrl}`;
                } else if (!audioUrl.startsWith('http')) {
                    // Priority 1: audio.qurancdn.com (Works for Alafasy)
                    // Priority 2: download.quranicaudio.com/quran/ (Traditional fallback)
                    audioUrl = `https://audio.qurancdn.com/${audioUrl}`;
                }

                console.log('[AudioService] Final Audio URL:', audioUrl);

                // Check for cached audio file
                const cachedAudio = await cache.match(audioUrl);
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
                this.audio.playbackRate = this.state.value.playbackRate;

                // Wait for audio to be ready for smoother playback
                // But don't wait too long to avoid blocking
                await new Promise<void>((resolve) => {
                    if (this.audio.readyState >= 3) { // HAVE_FUTURE_DATA or higher
                        resolve();
                        return;
                    }
                    const canPlayHandler = () => {
                        this.audio.removeEventListener('canplay', canPlayHandler);
                        resolve();
                    };
                    this.audio.addEventListener('canplay', canPlayHandler);

                    // Timeout after 500ms to not block if metadata takes too long
                    setTimeout(() => {
                        this.audio.removeEventListener('canplay', canPlayHandler);
                        resolve();
                    }, 500);
                });

                try {
                    await this.audio.play();
                    console.log('[AudioService] Playback started successfully');
                    this.isPlayingNewAudio = false;

                    // Check if there's a pending request (e.g., reciter was changed during load)
                    if (this.pendingPlayRequest) {
                        const pending = this.pendingPlayRequest;
                        this.pendingPlayRequest = null;
                        setTimeout(() => this.playVerse(pending.verseKey, pending.reciterId), 100);
                    }
                } catch (playError) {
                    console.error('[AudioService] Playback failed/blocked:', playError);
                    this.isPlayingNewAudio = false;
                    // If it's a 404 and we used the new CDN, try the old fallback
                    if (this.audio.src.includes('audio.qurancdn.com') && !this.isTimedPlayback) {
                        const fallbackUrl = this.audio.src.replace('audio.qurancdn.com', 'download.quranicaudio.com/quran');
                        console.log('[AudioService] Retrying with fallback URL:', fallbackUrl);
                        this.audio.src = fallbackUrl;
                        this.audio.load();
                        this.audio.play().catch(e => {
                            console.error('[AudioService] Fallback also failed:', e);
                            this.isPlayingNewAudio = false;
                        });
                    } else {
                        this.updateState({ isPlaying: false, isBuffering: false });
                    }
                }
            } else {
                console.warn('[AudioService] No audio URL found');
                this.updateState({ isBuffering: false, isPlaying: false });
                this.isPlayingNewAudio = false;
            }
        } catch (error) {
            console.error('[AudioService] Error in playVerse:', error);
            this.updateState({ isBuffering: false, isPlaying: false });
            this.isPlayingNewAudio = false;
        }
    }

    pause() {
        this.userExplicitlyPaused = true;
        this.audio.pause();
    }

    resume() {
        this.userExplicitlyPaused = false;
        this.wasInterrupted = false;
        if (this.audio.src) {
            this.audio.play();
        }
    }

    async stop() {
        this.userExplicitlyPaused = true;
        await this.stopAudioCompletely();
        this.updateState({ isPlaying: false, currentVerseKey: null });
    }

    private async stopAudioCompletely(): Promise<void> {
        // Stop audio immediately and clear any pending state
        if (!this.audio.paused) {
            this.audio.pause();
        }
        await this.stopForegroundService();
        this.audio.currentTime = 0;

        // Clear any pending play requests to prevent overlap
        this.pendingPlayRequest = null;

        return Promise.resolve();
    }

    prime() {
        // Unlock audio context synchronously in response to user click
        if (this.audio.paused) {
            if (!this.audio.src) {
                this.audio.src = this.SILENT_SRC;
            }
            this.audio.play().then(() => {
                // Keep it "ready"
                this.audio.pause();
            }).catch(() => { });
        }
    }

    async setReciter(id: number) {
        const currentKey = this.state.value.currentVerseKey;
        const wasPlaying = this.state.value.isPlaying;

        console.log(`[AudioService] setReciter: newId=${id}, currentKey=${currentKey}, wasPlaying=${wasPlaying}`);

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

        this.updateState({
            reciterId: id,
            currentAyahRepeatCount: 0,
            currentGroupRepeatCount: 0,
            isPlaying: false,
            isBuffering: false
        });

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

    setPlaybackRate(rate: number) {
        this.updateState({ playbackRate: rate });
        this.audio.playbackRate = rate;
    }

    setRepeatSettings(ayahRepeat: number, groupRepeat: number) {
        this.updateState({
            repeatAyah: ayahRepeat,
            repeatGroup: groupRepeat,
            currentAyahRepeatCount: 0,
            currentGroupRepeatCount: 0
        });
    }

    setPlaybackRange(range: PlaybackState['playbackRange']) {
        this.updateState({ playbackRange: range, currentGroupRepeatCount: 0 });
    }

    private handleAudioEnded() {
        const s = this.state.value;

        // Prevent handling if new audio is loading to avoid conflicts
        if (this.isPlayingNewAudio) {
            console.log('[AudioService] Ignoring handleAudioEnded - new audio loading');
            return;
        }

        // 1. Ayah Repetition
        if (s.repeatAyah > 1 && s.currentAyahRepeatCount + 1 < s.repeatAyah) {
            console.log(`[AudioService] Repeating Ayah (${s.currentAyahRepeatCount + 2}/${s.repeatAyah})`);
            this.updateState({ currentAyahRepeatCount: s.currentAyahRepeatCount + 1 });

            if (this.isTimedPlayback && this.currentVerseTiming) {
                this.audio.currentTime = this.currentVerseTiming.timestamp_from / 1000;
            } else {
                this.audio.currentTime = 0;
            }

            this.audio.play().catch(err => {
                console.error('[AudioService] Failed to replay ayah:', err);
            });
            return;
        }

        // 2. Clear Ayah Repeat count and notify completion to advance
        // Mark that we've notified for this verse to prevent duplicate notifications
        if (s.currentVerseKey && s.currentVerseKey !== this.lastEndTriggeredVerseKey) {
            console.log(`[AudioService] Verse ${s.currentVerseKey} completed. Notifying advance.`);
            this.lastEndTriggeredVerseKey = s.currentVerseKey;
            this.updateState({ currentAyahRepeatCount: 0 });

            // Notify immediately for smooth transition
            this.verseCompleted.next(s.currentVerseKey);
        } else {
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

                    const cachedAudio = await cache.match(audioUrl);
                    if (cachedAudio) {
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
                return;
            }

            this.currentVerseTiming = timing;
            if (this.audio.paused) {
                await this.audio.play();
            }

            // Seek to the verse ONLY if necessary
            const targetTime = timing.timestamp_from / 1000;
            const currentTime = this.audio.currentTime;

            // Gapless Logic:
            // If we are "close" to the target time (e.g. within 1 second), and it's a gapless candidate,
            // we assume the audio just naturally flowed there.
            // But if we are far off (user clicked a specific verse), we MUST seek.
            const isCloseEnough = Math.abs(currentTime - targetTime) < 1.5; // 1.5s tolerance for natural flow

            if (!isGaplessCandidate || !isCloseEnough) {
                console.log(`[AudioService] Seeking to verse start: ${targetTime}s (Current: ${currentTime}s)`);
                this.audio.currentTime = targetTime;
            } else {
                console.log(`[AudioService] Gapless transition: Continuous playback at ${currentTime}s`);
            }

            this.updateState({ isPlaying: true, isBuffering: false });
            this.isPlayingNewAudio = false;

            // Check if there's a pending request (e.g., reciter was changed during load)
            if (this.pendingPlayRequest) {
                const pending = this.pendingPlayRequest;
                this.pendingPlayRequest = null;
                setTimeout(() => this.playVerse(pending.verseKey, pending.reciterId), 100);
            }
        } catch (error) {
            console.error('[AudioService] Timed playback error:', error);
            this.updateState({ isPlaying: false, isBuffering: false });
            this.isPlayingNewAudio = false;
        }
    }

    async isSurahCached(surahId: number, reciterId: number): Promise<boolean> {
        try {
            const cache = await caches.open(this.CACHE_NAME);
            const isTimed = this.TIMED_RECITERS.includes(reciterId);

            if (isTimed) {
                const timingsUrl = `${this.qdcAudioUrlBase}/${reciterId}/audio_files?chapter=${surahId}&segments=true`;
                const cachedTimings = await cache.match(timingsUrl);
                if (!cachedTimings) return false;

                const timingsRes = await cachedTimings.json();
                let audioUrl = timingsRes?.audio_files?.[0]?.audio_url;
                if (!audioUrl) return false;
                if (!audioUrl.startsWith('http')) audioUrl = `https:${audioUrl}`;

                const cachedAudio = await cache.match(audioUrl);
                return !!cachedAudio;
            } else {
                const metadataUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
                const cachedMeta = await cache.match(metadataUrl);
                if (!cachedMeta) return false;

                // Check a sample verse to be more sure
                const metaRes = await cachedMeta.json();
                const sampleVerse = metaRes?.audio_files?.[0];
                if (!sampleVerse) return false;

                let audioUrl = sampleVerse.url;
                if (audioUrl.startsWith('//')) audioUrl = `https:${audioUrl}`;
                else if (!audioUrl.startsWith('http')) audioUrl = `https://audio.qurancdn.com/${audioUrl}`;

                let cachedAudio = await cache.match(audioUrl);

                // Fallback check if not found in primary CDN
                if (!cachedAudio && audioUrl.includes('audio.qurancdn.com')) {
                    const fallbackUrl = audioUrl.replace('audio.qurancdn.com', 'download.quranicaudio.com/quran');
                    cachedAudio = await cache.match(fallbackUrl);
                }

                return !!cachedAudio;
            }
        } catch (e) { return false; }
    }

    async downloadSurah(surahId: number, reciterId: number): Promise<void> {
        console.log(`[AudioService] Starting download: Surah ${surahId}, Reciter ${reciterId}`);
        const cache = await caches.open(this.CACHE_NAME);
        const isTimed = this.TIMED_RECITERS.includes(reciterId);

        if (isTimed) {
            const timingsUrl = `${this.qdcAudioUrlBase}/${reciterId}/audio_files?chapter=${surahId}&segments=true`;
            const timingsRes = await firstValueFrom(this.http.get<any>(timingsUrl).pipe(timeout(30000)));
            if (!timingsRes?.audio_files?.[0]) throw new Error('Failed to fetch timed metadata');

            let audioUrl = timingsRes.audio_files[0].audio_url;
            if (!audioUrl.startsWith('http')) audioUrl = `https:${audioUrl}`;

            // Download Audio File
            const audioBlob = await firstValueFrom(this.http.get(audioUrl, { responseType: 'blob' }).pipe(timeout(300000))); // 5 mins for large file
            await cache.put(audioUrl, new Response(audioBlob));

            // Cache Timings only AFTER audio is successful
            await cache.put(timingsUrl, new Response(JSON.stringify(timingsRes)));

            // Also cache v4 marker for isSurahCached calls from other places
            const v4MarkerUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
            await cache.put(v4MarkerUrl, new Response(JSON.stringify({ downloaded: true })));

            console.log(`[AudioService] Timed download complete: Surah ${surahId}`);
            return;
        }

        const metadataUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${surahId}`;
        try {
            const metaResponse = await firstValueFrom(
                this.http.get<any>(metadataUrl).pipe(timeout(30000), catchError(() => of(null)))
            );
            if (!metaResponse || !metaResponse.audio_files) throw new Error('Failed to fetch metadata');

            let successCount = 0;
            for (const item of metaResponse.audio_files) {
                let audioUrl = item.url;
                if (audioUrl.startsWith('//')) {
                    audioUrl = `https:${audioUrl}`;
                } else if (!audioUrl.startsWith('http')) {
                    audioUrl = `https://audio.qurancdn.com/${audioUrl}`;
                }

                let cachedFile = await cache.match(audioUrl);

                // Fallback check for downloader
                if (!cachedFile && audioUrl.includes('audio.qurancdn.com')) {
                    const fallbackUrl = audioUrl.replace('audio.qurancdn.com', 'download.quranicaudio.com/quran');
                    cachedFile = await cache.match(fallbackUrl);
                    if (cachedFile) audioUrl = fallbackUrl;
                }

                if (!cachedFile) {
                    try {
                        let success = false;
                        // Try primary URL
                        try {
                            const audioBlob = await firstValueFrom(this.http.get(audioUrl, { responseType: 'blob' }).pipe(timeout(60000)));
                            if (audioBlob && audioBlob.size > 100) {
                                await cache.put(audioUrl, new Response(audioBlob));
                                success = true;
                            }
                        } catch (e) {
                            // Try fallback URL if relative
                            if (!item.url.startsWith('//') && !item.url.startsWith('http')) {
                                const fallbackUrl = `https://download.quranicaudio.com/quran/${item.url}`;
                                console.log('[AudioService] Trying fallback for download:', fallbackUrl);
                                const audioBlob = await firstValueFrom(this.http.get(fallbackUrl, { responseType: 'blob' }).pipe(timeout(60000)));
                                if (audioBlob && audioBlob.size > 100) {
                                    await cache.put(fallbackUrl, new Response(audioBlob));
                                    audioUrl = fallbackUrl; // Update to cached version
                                    success = true;
                                }
                            }
                        }

                        if (success) successCount++;
                    } catch (e) {
                        console.warn(`[AudioService] Failed to download ayah ${item.verse_key}`, e);
                        continue;
                    }
                } else {
                    successCount++;
                }

                // Cache individual ayah metadata
                const ayahMetadataUrl = `${this.audioUrlBase}/${reciterId}/by_ayah/${item.verse_key}`;
                const ayahMetadata = { audio_file: item };
                await cache.put(ayahMetadataUrl, new Response(JSON.stringify(ayahMetadata)));
            }

            // Only cache chapter metadata AFTER at least some success
            if (successCount > 0) {
                await cache.put(metadataUrl, new Response(JSON.stringify(metaResponse)));
            }
            console.log(`[AudioService] Verse download complete: Surah ${surahId}, success: ${successCount}`);
        } catch (error) {
            console.error(`[AudioService] Download failed for Surah ${surahId}:`, error);
            throw error;
        }
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

    private async preloadNextVerse(currentVerseKey: string, reciterId: number) {
        try {
            const parts = currentVerseKey.split(':');
            const surah = parseInt(parts[0]);
            const ayah = parseInt(parts[1]);
            const nextVerseKey = `${surah}:${ayah + 1}`;

            const url = await this.getOrFetchAudioUrl(nextVerseKey, reciterId);
            if (url && !url.startsWith('blob:')) {
                const cache = await caches.open(this.CACHE_NAME);
                const match = await cache.match(url);
                if (!match) {
                    try {
                        const response = await fetch(url);
                        if (response.ok) {
                            await cache.put(url, response.clone());
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { }
    }
}
