import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PeaksService {
  private peaksCache = new Map<string, { min: Float32Array; max: Float32Array }>();
  private audioContext: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    return this.audioContext;
  }

  async loadPeaks(audioUrl: string, targetPoints: number = 2000): Promise<{ min: Float32Array; max: Float32Array } | null> {
    if (this.peaksCache.has(audioUrl)) {
      return this.peaksCache.get(audioUrl)!;
    }

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0); // Left channel or mono
      const totalSamples = channelData.length;
      const step = Math.max(1, Math.floor(totalSamples / targetPoints));
      const actualPoints = Math.floor(totalSamples / step);

      const minPeaks = new Float32Array(actualPoints);
      const maxPeaks = new Float32Array(actualPoints);

      for (let i = 0; i < actualPoints; i++) {
        const start = i * step;
        const end = Math.min(start + step, totalSamples);
        let min = 0;
        let max = 0;

        for (let j = start; j < end; j++) {
          const val = channelData[j];
          if (val < min) min = val;
          if (val > max) max = val;
        }

        minPeaks[i] = min;
        maxPeaks[i] = max;
      }

      const result = { min: minPeaks, max: maxPeaks };
      this.peaksCache.set(audioUrl, result);
      return result;
    } catch (err) {
      console.warn('PeaksService: could not decode audio data for waveform, generating simulated peaks:', err);
      // Fallback: Generate clean studio aesthetic peak representation
      return this.generateFallbackPeaks(targetPoints);
    }
  }

  private generateFallbackPeaks(points: number): { min: Float32Array; max: Float32Array } {
    const min = new Float32Array(points);
    const max = new Float32Array(points);
    for (let i = 0; i < points; i++) {
      const envelope = 0.3 + 0.6 * Math.abs(Math.sin(i * 0.05) * Math.cos(i * 0.12));
      const val = Math.random() * envelope;
      min[i] = -val;
      max[i] = val;
    }
    return { min, max };
  }
}
