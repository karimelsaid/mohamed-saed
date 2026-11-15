import { Injectable } from '@angular/core';
import { ThumbnailFrame } from './timeline.types';

@Injectable({ providedIn: 'root' })
export class ThumbnailsService {
  private cache = new Map<string, ThumbnailFrame[]>();
  private offscreenVideo: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;

  // Lazily extract keyframes using HTML5 canvas from video source for lightweight, fast filmstrip
  async generateThumbnails(sourceUrl: string, duration: number, stepSec: number = 2.0): Promise<ThumbnailFrame[]> {
    if (!sourceUrl || duration <= 0) return [];

    const cacheKey = `${sourceUrl}_${stepSec}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const frames: ThumbnailFrame[] = [];
    const count = Math.min(60, Math.max(5, Math.floor(duration / stepSec)));
    const interval = duration / count;

    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = sourceUrl;
      video.muted = true;
      video.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video for thumbnails'));
        setTimeout(() => resolve(), 3000); // timeout fallback
      });

      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 54;
      const ctx = canvas.getContext('2d');

      if (!ctx) return [];

      for (let i = 0; i < count; i++) {
        const time = i * interval;
        video.currentTime = time;
        await new Promise<void>(resolve => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          setTimeout(onSeeked, 150); // safety fallback
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({
          time,
          url: canvas.toDataURL('image/jpeg', 0.6)
        });
      }

      this.cache.set(cacheKey, frames);
    } catch (e) {
      console.warn('Thumbnail generation warning:', e);
    }

    return frames;
  }

  getThumbnailAtTime(sourceUrl: string, time: number, stepSec: number = 2.0): string | null {
    const cacheKey = `${sourceUrl}_${stepSec}`;
    const list = this.cache.get(cacheKey);
    if (!list || list.length === 0) return null;

    let closest = list[0];
    let minDiff = Math.abs(closest.time - time);
    for (const frame of list) {
      const diff = Math.abs(frame.time - time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = frame;
      }
    }
    return closest.url;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
