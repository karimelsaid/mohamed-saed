import { Injectable, signal, computed } from '@angular/core';
import { TrackConfig, TimelineMarker, TrackHeightMode } from './timeline.types';

@Injectable({ providedIn: 'root' })
export class TimelineStore {
  // Zoom: pixels per second (e.g. 20px to 400px/s)
  zoom = signal<number>(80);

  // Scroll & Dimensions
  scrollLeft = signal<number>(0);
  containerWidth = signal<number>(1000);
  timelineHeight = signal<number>(190); // default height in px (compact to maximize video height)
  isCollapsed = signal<boolean>(false);

  // Playhead & Snapping
  playheadTime = signal<number>(0);
  snappingEnabled = signal<boolean>(true);
  showRemovedOverlay = signal<boolean>(true);
  snapGuidePosition = signal<number | null>(null); // pixel position of active snap guide line

  // Transcript Display Mode (Paragraphs or Individual Words) & Search
  transcriptViewMode = signal<'paragraphs' | 'words'>('paragraphs');
  searchQuery = signal<string>('');

  // Timeline Layout Mode: 'contiguous' (flush clips like CapCut/Premiere) or 'source' (full source with gap voids)
  layoutMode = signal<'contiguous' | 'source'>('source');

  // Selections & Markers
  selectedClipIds = signal<string[]>([]);
  markers = signal<TimelineMarker[]>([]);

  // Track Configurations
  tracks = signal<TrackConfig[]>([
    { id: 'video', name: 'الفيديو', icon: '🎬', visible: true, locked: false, heightMode: 'normal' },
    { id: 'cameras', name: 'الكاميرات', icon: '📹', visible: true, locked: false, heightMode: 'compact' },
    { id: 'audio', name: 'الصوت', icon: '🎙️', visible: true, muted: false, solo: false, locked: false, heightMode: 'normal' },
    { id: 'captions', name: 'التعليقات والنص', icon: '💬', visible: true, locked: false, heightMode: 'tall' }
  ]);

  // Track height mapping
  readonly TRACK_HEIGHTS: Record<TrackHeightMode, number> = {
    compact: 38,
    normal: 64,
    tall: 112
  };

  // Convert time (seconds) to pixel offset on the timeline (LTR)
  timeToPixel(seconds: number): number {
    return Math.max(0, seconds * this.zoom());
  }

  // Convert pixel offset on the timeline (LTR) to time in seconds
  pixelToTime(pixels: number): number {
    return Math.max(0, pixels / this.zoom());
  }

  // Format time to timecode: mm:ss:ff (at 30fps)
  formatTimecode(seconds: number, fps: number = 30): string {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const totalSeconds = Math.floor(seconds);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const f = Math.floor((seconds - totalSeconds) * fps);
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    const ff = f.toString().padStart(2, '0');
    return `${mm}:${ss}:${ff}`;
  }

  toggleTrackVisibility(trackId: string): void {
    const list = this.tracks().map(t => t.id === trackId ? { ...t, visible: !t.visible } : t);
    this.tracks.set(list);
  }

  toggleTrackLock(trackId: string): void {
    const list = this.tracks().map(t => t.id === trackId ? { ...t, locked: !t.locked } : t);
    this.tracks.set(list);
  }

  toggleTrackMute(trackId: string): void {
    const list = this.tracks().map(t => t.id === trackId ? { ...t, muted: !t.muted } : t);
    this.tracks.set(list);
  }

  cycleTrackHeight(trackId: string): void {
    const modes: TrackHeightMode[] = ['compact', 'normal', 'tall'];
    const list = this.tracks().map(t => {
      if (t.id === trackId) {
        const nextIdx = (modes.indexOf(t.heightMode) + 1) % modes.length;
        return { ...t, heightMode: modes[nextIdx] };
      }
      return t;
    });
    this.tracks.set(list);
  }

  setZoom(newZoom: number, anchorTime?: number): void {
    const clamped = Math.min(400, Math.max(15, newZoom));
    this.zoom.set(clamped);
  }

  addMarker(time: number, label: string = 'علامة'): void {
    const current = this.markers();
    const newMarker: TimelineMarker = {
      id: `m_${Date.now()}`,
      time,
      label,
      color: '#38bdf8'
    };
    this.markers.set([...current, newMarker].sort((a, b) => a.time - b.time));
  }

  removeMarker(markerId: string): void {
    this.markers.set(this.markers().filter(m => m.id !== markerId));
  }
}
