import { registerPlugin } from '@capacitor/core';

export interface MediaBridgePlugin {
    play(options: { url: string; title: string; artist: string }): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(): Promise<void>;
    getStatus(): Promise<{ isPlaying: boolean; position: number; duration: number }>;
    addListener(eventName: 'playbackEnded', listenerFunc: (info: any) => void): Promise<any>;
}

export const MediaBridge = registerPlugin<MediaBridgePlugin>('MediaBridge');
