export type TrackHeightMode = 'compact' | 'normal' | 'tall';

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color?: string;
}

export interface TrackConfig {
  id: 'video' | 'cameras' | 'audio' | 'captions';
  name: string;
  icon: string;
  visible: boolean;
  muted?: boolean;
  solo?: boolean;
  locked?: boolean;
  heightMode: TrackHeightMode;
}

export interface SnapPoint {
  time: number;
  type: 'playhead' | 'clip-edge' | 'caption-edge' | 'marker';
  label?: string;
}

export interface TimelineContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetType: 'segment' | 'caption' | 'timeline';
  targetId?: string;
  time: number;
}

export interface ThumbnailFrame {
  time: number;
  url: string;
}

export interface AudioPeaksData {
  sampleRate: number;
  length: number;
  peaks: Float32Array | number[]; // Normalized min/max peak pairs [-1, 1]
}
