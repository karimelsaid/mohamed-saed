import { registerPlugin } from '@capacitor/core';

export interface QueueItem {
    url: string;
    title: string;
    artist: string;
    verseKey: string;
    clippingStartMs?: number;
    clippingEndMs?: number;
}

export interface MediaBridgePlugin {
    play(options: { url: string; title: string; artist: string; startPositionMs?: number; clippingStartMs?: number; clippingEndMs?: number }): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(): Promise<void>;
    seekTo(options: { position: number }): Promise<void>;
    setRate(options: { rate: number }): Promise<void>;
    setSleepTimer(options: { minutes: number }): Promise<void>;
    getStatus(): Promise<{
        isPlaying: boolean;
        position: number;
        duration: number;
        queueSize?: number;
        queueIndex?: number;
        currentVerseKey?: string;
    }>;

    // Native Queue Methods for background playback
    setQueue(options: { items: QueueItem[]; startIndex?: number; startPositionMs?: number }): Promise<void>;
    addToQueue(options: QueueItem): Promise<void>;
    clearQueue(): Promise<void>;

    // Event Listeners
    addListener(eventName: 'playbackEnded', listenerFunc: (info: any) => void): Promise<any>;
    addListener(eventName: 'verseChanged', listenerFunc: (info: { verseKey: string }) => void): Promise<any>;
}

export const MediaBridge = registerPlugin<MediaBridgePlugin>('MediaBridge');
