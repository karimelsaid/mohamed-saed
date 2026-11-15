import { Injectable } from '@angular/core';
import { TimelineStore } from './timeline.store';
import { EdlService } from '../../core/edl.service';

@Injectable({ providedIn: 'root' })
export class SnappingService {
  readonly SNAP_THRESHOLD_PX = 8; // Snap distance in pixels

  constructor(
    private store: TimelineStore,
    private edlService: EdlService
  ) {}

  findSnapPoint(time: number, excludeClipId?: string): { time: number; snapped: boolean; guidePixel: number | null } {
    if (!this.store.snappingEnabled()) {
      return { time, snapped: false, guidePixel: null };
    }

    const zoom = this.store.zoom();
    const thresholdSec = this.SNAP_THRESHOLD_PX / zoom;
    const snapCandidates: number[] = [];

    // 1. Playhead
    snapCandidates.push(this.store.playheadTime());

    // 2. Markers
    for (const marker of this.store.markers()) {
      snapCandidates.push(marker.time);
    }

    // 3. EDL Segment boundaries
    const edl = this.edlService.getEdl();
    if (edl) {
      for (const seg of edl.segments) {
        if (seg.id !== excludeClipId) {
          snapCandidates.push(seg.srcStart);
          snapCandidates.push(seg.srcEnd);
        }
      }

      // 4. Caption word boundaries
      for (const w of edl.transcript) {
        if (!w.removed) {
          snapCandidates.push(w.start);
          snapCandidates.push(w.end);
        }
      }
    }

    // Find closest candidate within thresholdSec
    let closestTime = time;
    let minDiff = thresholdSec;
    let snapped = false;

    for (const cand of snapCandidates) {
      const diff = Math.abs(cand - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestTime = cand;
        snapped = true;
      }
    }

    const guidePixel = snapped ? this.store.timeToPixel(closestTime) : null;
    this.store.snapGuidePosition.set(guidePixel);

    return {
      time: closestTime,
      snapped,
      guidePixel
    };
  }

  clearGuide(): void {
    this.store.snapGuidePosition.set(null);
  }
}
