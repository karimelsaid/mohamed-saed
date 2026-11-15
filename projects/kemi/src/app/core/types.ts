export interface VirtualCamera {
  id: string;
  name: string;
  zoom: number;
  panX: number;
  panY: number;
  rotateY?: number; // 3D Yaw angle (-15deg to +15deg)
  rotateX?: number; // 3D Pitch angle (-10deg to +10deg)
  depth?: number;   // 3D Perspective intensity
  renderedVideoPath?: string; // AI generated video file path for this camera angle
}

export interface EDL {
  version: number;
  sources: Source[];
  transcript: TranscriptWord[];
  segments: Segment[];
  virtualCameras?: VirtualCamera[];
  captions: Captions;
  export: ExportConfig;
  audioEnhanced?: boolean;
  cinematicOptions?: any;
}

export interface Source {
  id: string;
  path: string;
  proxy?: string;
  offsetSec: number;
  isMainAudio: boolean;
}

export interface TranscriptWord {
  id: string;
  text: string;
  start: number;
  end: number;
  kind: 'word' | 'silence' | 'filler';
  removed: boolean;
  removeReason: RemoveReason | null;
  confidence?: number;
}

export type RemoveReason = 'silence' | 'filler' | 'stutter' | 'repeat' | 'retake' | 'elongation' | 'manual';

export interface TranscriptParagraph {
  id: string;
  startIndex: number;
  endIndex: number;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
  hasRemoved: boolean;
  allRemoved: boolean;
  hasFlagged?: boolean;
  flaggedCount?: number;
}

export interface Segment {
  id: string;
  camera: string;
  srcStart: number;
  srcEnd: number;
  zoom: number;
}

export interface Captions {
  template: string;
  enabled: boolean;
  wordsPerLine?: number;
  position?: 'bottom' | 'middle' | 'top';
  fontSize?: number;
}

export type ExportResolution = '4k' | '2k' | '1080p';
export type ExportQualityPreset = 'master' | 'high' | 'fast';

export interface ExportConfig {
  formats: AspectRatio[];
  resolution?: ExportResolution;
  qualityPreset?: ExportQualityPreset;
  enhancePhoneVideo?: boolean;
}

export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface ProcessingProgress {
  step: string;
  progress: number;
  total: number;
  message: string;
}

export interface DetectionSettings {
  silenceThreshold: number;
  minSilenceLength: number;
  paddingMs: number;
  crossfadeMs: number;
  fillerWords: string[];
  preset: 'gentle' | 'normal' | 'aggressive';
}

export type ProjectEDL = EDL;

