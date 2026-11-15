import { Component, signal, ViewChild, ElementRef, computed, inject, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EdlService } from './core/edl.service';
import { ProjectService } from './core/project.service';
import { IpcService } from './core/ipc.service';
import { EDL, TranscriptWord, RemoveReason, AspectRatio, Segment, TranscriptParagraph, VirtualCamera } from './core/types';
import { TimelineComponent, TimelineStore } from './features/timeline';

interface CaptionPhrase {
  words: TranscriptWord[];
  activeWordId: string | null;
}

@Component({
  imports: [CommonModule, FormsModule, TimelineComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnDestroy {
  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('aiCameraPlayer') aiCameraPlayerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('timelineTrack') timelineTrackRef!: ElementRef<HTMLDivElement>;

  timelineStore = inject(TimelineStore);
  private ngZone = inject(NgZone);


  // Project & Flow Signals
  projectPath = signal<string>('');
  edl = signal<EDL | null>(null);
  processing = signal<boolean>(false);
  progress = signal<number>(0);
  progressMessage = signal<string>('');
  currentPipelineStep = signal<number>(1);
  modelSize = signal<'large-v3' | 'medium' | 'small' | 'base'>('small'); // Default to 'small' (recommended for CPU & memory stability)

  // State: Has AI Transcription (Step 4) been performed?
  hasTranscribed = signal<boolean>(false);
  extractedAudioPath = signal<string>('');

  // AI Cuts Before & After Workflow
  aiCutsApplied = signal<boolean>(false);
  detectedCutsStats = signal<{ count: number; savedSec: number }>({ count: 0, savedSec: 0 });

  // Video & Playback Signals
  videoUrl = signal<string>('');
  isPlaying = signal<boolean>(false);
  currentTime = signal<number>(0);
  videoDuration = signal<number>(0);
  playbackSpeed = signal<number>(1.0);
  skipRemovedPlayback = signal<boolean>(true);
  aspectRatio = signal<AspectRatio>('16:9');
  currentActiveWord = signal<TranscriptWord | null>(null);
  currentActivePhrase = signal<CaptionPhrase | null>(null);

  // Monitor Display & Sizing
  videoZoom = signal<number>(100); // 100%, 75%, 125%, 150%
  isMonitorExpanded = signal<boolean>(false);
  activeSegmentZoom = signal<number>(1.0); // Dynamic punch-in zoom for segments (1.0x, 1.2x, etc.)
  activeSegmentPanX = signal<number>(0); // Dynamic framing X (-30% to +30%)
  activeSegmentPanY = signal<number>(0); // Dynamic framing Y (-30% to +30%)
  activeSegmentRotateY = signal<number>(0); // 3D Camera Yaw rotation (-15deg to +15deg)
  activeSegmentRotateX = signal<number>(0); // 3D Camera Pitch tilt (-10deg to +10deg)
  activeCameraName = signal<string>('زاوية واسعة (مباشرة)');
  activeCameraVideoUrl = signal<string>(''); // Currently displayed AI camera video URL
  inspectorWidthPercent = signal<number>(40); // 40% default (can be 50% or dragged dynamically)
  isDraggingSplit = signal<boolean>(false);

  // Timeline State
  timelineZoom = signal<number>(1.0); // 1.0x to 5.0x

  // Statistics Signals
  timeSaved = signal<number>(0);
  timeSavedPercentage = signal<number>(0);
  originalDuration = signal<number>(0);
  newDuration = signal<number>(0);

  // Studio UI Navigation Signals
  activeTab = signal<'script' | 'captions' | 'cameras' | 'cinematic' | 'audio' | 'export'>('script');
  searchQuery = signal<string>('');

  // Text-Based Script & Word-Level Editor Signals
  scriptSearchQuery = signal<string>('');
  scriptViewMode = signal<'paragraphs' | 'flow'>('paragraphs');
  scriptAutoScroll = signal<boolean>(true);
  filterStuttersOnly = signal<boolean>(false);
  currentFlaggedIndex = signal<number>(-1);

  // Silence & Pause Detection Signals in Script Editor
  silenceThreshold = signal<number>(0.4);
  silencePreset = signal<'gentle' | 'normal' | 'aggressive'>('normal');

  silenceStats = computed(() => {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) {
      return { total: 0, removed: 0, kept: 0, totalSec: '0.0', savedSec: '0.0' };
    }
    const silences = curEdl.transcript.filter(w => w.kind === 'silence');
    const removed = silences.filter(w => w.removed);
    const totalSec = silences.reduce((acc, w) => acc + (w.end - w.start), 0);
    const savedSec = removed.reduce((acc, w) => acc + (w.end - w.start), 0);
    return {
      total: silences.length,
      removed: removed.length,
      kept: silences.length - removed.length,
      totalSec: totalSec.toFixed(1),
      savedSec: savedSec.toFixed(1)
    };
  });

  scriptStats = computed(() => {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) {
      return {
        total: 0,
        removed: 0,
        active: 0,
        stuttersCount: 0,
        repeatsCount: 0,
        elongationsCount: 0,
        fillersCount: 0,
        flaggedCount: 0,
        savedSec: '0.0',
        silencesTotal: 0,
        silencesRemoved: 0
      };
    }
    const all = curEdl.transcript;
    const spoken = all.filter(w => w.kind !== 'silence');
    const silences = all.filter(w => w.kind === 'silence');
    const removedWords = spoken.filter(w => w.removed);
    const removedSilences = silences.filter(w => w.removed);

    const stuttersCount = spoken.filter(w => w.removeReason === 'stutter' || this.isStutterWord(w)).length;
    const repeatsCount = spoken.filter(w => w.removeReason === 'repeat').length;
    const elongationsCount = spoken.filter(w => w.removeReason === 'elongation' || this.isElongatedWord(w)).length;
    const fillersCount = spoken.filter(w => (w.kind === 'filler' || w.removeReason === 'filler') && w.removeReason !== 'stutter' && w.removeReason !== 'repeat' && w.removeReason !== 'elongation').length;
    const flaggedCount = spoken.filter(w => this.isFlaggedWord(w)).length;

    const savedFromWords = removedWords.reduce((acc, w) => acc + Math.max(0.04, w.end - w.start), 0);
    const savedFromSilences = removedSilences.reduce((acc, w) => acc + (w.end - w.start), 0);
    const saved = savedFromWords + savedFromSilences;

    return {
      total: spoken.length,
      removed: removedWords.length,
      active: spoken.length - removedWords.length,
      stuttersCount,
      repeatsCount,
      elongationsCount,
      fillersCount,
      flaggedCount,
      savedSec: saved.toFixed(1),
      silencesTotal: silences.length,
      silencesRemoved: removedSilences.length
    };
  });

  // AI Cuts & Alternating Zoom Signals
  fillerWordsList = signal<string[]>(['ااا', 'امم', 'همم', 'آه', 'إيه']);
  newFillerInput = '';
  enableAlternatingZoom = signal<boolean>(true);

  // Captions Customization Signals
  showCaptions = signal<boolean>(true);
  wordsPerLine = signal<number>(3); // 1, 2, 3, 4, 6
  captionPosition = signal<'bottom' | 'middle' | 'top'>('bottom');
  captionFontSize = signal<number>(14); // 10, 14, 18, 22 px
  showCaptionSizeBadge = signal<boolean>(false);
  private captionBadgeTimeout: any = null;
  captionStyles = signal<string[]>([
    'knooz-default',
    'modern-pop',
    'minimal-clean',
    'punchy-tiktok'
  ]);
  selectedCaptionStyle = signal<string>('knooz-default');

  // Cinematic Enhancement Signals
  cinematicEnabled = signal<boolean>(false);
  cinematicPreset = signal<'natural' | 'warm-cinema' | 'cool-film' | 'vibrant' | 'custom'>('natural');
  cinematicSharpness = signal<number>(0.6);    // 0.0 - 1.5
  cinematicContrast = signal<number>(1.05);    // 0.8 - 1.4
  cinematicSaturation = signal<number>(1.15);  // 0.5 - 2.0
  cinematicBrightness = signal<number>(0.02);  // -0.1 - 0.1
  cinematicTemperature = signal<'neutral' | 'warm' | 'cool'>('neutral');

  // Virtual Multi-Camera Signals
  autoSwitchEnabled = signal<boolean>(true);
  autoSwitchIntervalSec = signal<number>(5); // 3-15 seconds
  autoSwitchPattern = signal<'alternate-cuts' | 'sequential' | 'random' | 'smart'>('alternate-cuts');
  virtualCameras = computed<VirtualCamera[]>(() => {
    const curEdl = this.edl();
    return curEdl?.virtualCameras || this.edlService.getVirtualCameras();
  });
  hasMultipleCameras = computed(() => {
    return this.virtualCameras().length > 1;
  });
  cameraCount = computed(() => {
    return this.virtualCameras().length;
  });

  // AI Multi-Camera Signals
  aiMulticamStatus = signal<'idle' | 'processing' | 'complete' | 'error'>('idle');
  aiMulticamMode = signal<'preview' | 'full'>('preview');
  aiUnmirrorSelfie = signal<boolean>(true);
  aiMulticamPercent = signal<number>(0);
  aiMulticamFrame = signal<number>(0);
  aiMulticamTotalFrames = signal<number>(0);
  aiMulticamEta = signal<number>(0);
  aiMulticamError = signal<string>('');
  aiMulticamCameraCount = signal<number>(0);
  aiMulticamOutputDir = signal<string>('');

  // Video Export & Resolution Signals
  exportResolution = signal<'4k' | '2k' | '1080p'>('1080p');
  exportQualityPreset = signal<'master' | 'high' | 'fast'>('master');
  enhancePhoneVideo = signal<boolean>(true);
  phoneSharpening = signal<number>(0.85); // 0.0 - 1.5
  phoneDenoise = signal<boolean>(true);
  phoneColorBoost = signal<boolean>(true);

  onPhoneSharpeningChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.phoneSharpening.set(val);
  }

  // Studio Audio Enhancement Signals (Adobe Podcast Style)
  audioEnhanced = signal<boolean>(false);
  audioEnhancing = signal<boolean>(false);
  audioEnhanceStrength = signal<number>(0.85);
  audioEnhanceProfile = signal<'studio' | 'podcast' | 'clean'>('studio');
  audioEnhanceSuccess = signal<boolean>(false);

  setCinematicPreset(preset: 'natural' | 'warm-cinema' | 'cool-film' | 'vibrant' | 'custom') {
    this.cinematicPreset.set(preset);
    switch (preset) {
      case 'natural':
        this.cinematicSharpness.set(0.6);
        this.cinematicContrast.set(1.05);
        this.cinematicSaturation.set(1.15);
        this.cinematicBrightness.set(0.02);
        this.cinematicTemperature.set('neutral');
        break;
      case 'warm-cinema':
        this.cinematicSharpness.set(0.4);
        this.cinematicContrast.set(1.12);
        this.cinematicSaturation.set(1.1);
        this.cinematicBrightness.set(0.01);
        this.cinematicTemperature.set('warm');
        break;
      case 'cool-film':
        this.cinematicSharpness.set(0.5);
        this.cinematicContrast.set(1.1);
        this.cinematicSaturation.set(0.95);
        this.cinematicBrightness.set(0.0);
        this.cinematicTemperature.set('cool');
        break;
      case 'vibrant':
        this.cinematicSharpness.set(0.8);
        this.cinematicContrast.set(1.15);
        this.cinematicSaturation.set(1.4);
        this.cinematicBrightness.set(0.03);
        this.cinematicTemperature.set('neutral');
        break;
    }
  }

  // Computed CSS filter for live cinematic & phone preview on video element
  cinematicCssFilter = computed(() => {
    if (this.cinematicEnabled()) {
      const filters: string[] = [];
      const contrast = this.cinematicContrast();
      filters.push(`contrast(${contrast.toFixed(2)})`);
      const brightness = 1.0 + this.cinematicBrightness();
      filters.push(`brightness(${brightness.toFixed(3)})`);
      const saturation = this.cinematicSaturation();
      filters.push(`saturate(${saturation.toFixed(2)})`);
      const temp = this.cinematicTemperature();
      if (temp === 'warm') {
        filters.push('sepia(0.15)');
        filters.push('hue-rotate(-5deg)');
      } else if (temp === 'cool') {
        filters.push('hue-rotate(12deg)');
      }
      return filters.join(' ');
    }

    if (this.enhancePhoneVideo()) {
      const sharp = this.phoneSharpening();
      const contrast = 1.0 + (sharp * 0.08);
      const sat = this.phoneColorBoost() ? 'saturate(1.12)' : 'saturate(1.0)';
      return `contrast(${contrast.toFixed(2)}) brightness(1.01) ${sat}`;
    }

    return 'none';
  });

  // Web Audio Studio Live Preview Graph (matches FFmpeg broadcast chain)
  private audioCtx: AudioContext | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private warmthEq: BiquadFilterNode | null = null;
  private deboxEq: BiquadFilterNode | null = null;
  private presenceEq: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private dryGainNode: GainNode | null = null;
  private wetGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  // Deep copy EDL to guarantee Angular signal change detection on transcript/segments
  private deepCopyEdl(edl: EDL): EDL {
    return {
      ...edl,
      transcript: edl.transcript.map(w => ({ ...w })),
      segments: edl.segments.map(s => ({ ...s })),
      sources: edl.sources.map(s => ({ ...s })),
      captions: { ...edl.captions },
      export: { ...edl.export, formats: [...edl.export.formats] },
      virtualCameras: edl.virtualCameras ? edl.virtualCameras.map(c => ({ ...c })) : undefined
    };
  }

  initWebAudioStudio(): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video || this.mediaSourceNode) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();

      this.mediaSourceNode = this.audioCtx.createMediaElementSource(video);

      // Dry path (bypassed normal audio)
      this.dryGainNode = this.audioCtx.createGain();

      // Master Gain Node (enables instant zero-latency muting during jumps/seeks)
      this.masterGainNode = this.audioCtx.createGain();

      this.mediaSourceNode.connect(this.dryGainNode);
      this.dryGainNode.connect(this.masterGainNode);

      // Wet Studio Audio Path
      // 1. Highpass (80 Hz) - cuts table rumble & sub-audible mic bumps
      this.highpassFilter = this.audioCtx.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 80;

      // 2. Warmth EQ (200 Hz, +4.0 dB) - proximity warmth & chest resonance (stronger for live preview)
      this.warmthEq = this.audioCtx.createBiquadFilter();
      this.warmthEq.type = 'peaking';
      this.warmthEq.frequency.value = 200;
      this.warmthEq.Q.value = 0.8;
      this.warmthEq.gain.value = 4.0;

      // 3. De-box EQ (450 Hz, -3.5 dB) - room reflection & boxy reverb removal (aggressive)
      this.deboxEq = this.audioCtx.createBiquadFilter();
      this.deboxEq.type = 'peaking';
      this.deboxEq.frequency.value = 450;
      this.deboxEq.Q.value = 1.2;
      this.deboxEq.gain.value = -3.5;

      // 4. Studio Presence EQ (3200 Hz, +5.0 dB) - speech clarity & crisp consonants (prominent)
      this.presenceEq = this.audioCtx.createBiquadFilter();
      this.presenceEq.type = 'peaking';
      this.presenceEq.frequency.value = 3200;
      this.presenceEq.Q.value = 1.0;
      this.presenceEq.gain.value = 5.0;

      // 5. Broadcast Dynamics Compressor
      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -24;
      this.compressorNode.ratio.value = 4;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.080;
      this.compressorNode.knee.value = 8;

      // Wet Gain Output
      this.wetGainNode = this.audioCtx.createGain();

      // Connect Studio Audio Chain:
      this.mediaSourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.warmthEq);
      this.warmthEq.connect(this.deboxEq);
      this.deboxEq.connect(this.presenceEq);
      this.presenceEq.connect(this.compressorNode);
      this.compressorNode.connect(this.wetGainNode);
      this.wetGainNode.connect(this.masterGainNode);

      this.masterGainNode.connect(this.audioCtx.destination);

      this.updateLiveAudioFilter();
    } catch (err) {
      console.warn('Web Audio Studio init warning:', err);
    }
  }

  updateLiveAudioFilter(): void {
    if (!this.audioCtx || !this.dryGainNode || !this.wetGainNode) {
      this.initWebAudioStudio();
      if (!this.audioCtx || !this.dryGainNode || !this.wetGainNode) return;
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    const isEnhanced = this.audioEnhanced();
    const now = this.audioCtx.currentTime;
    this.dryGainNode.gain.cancelScheduledValues(now);
    this.wetGainNode.gain.cancelScheduledValues(now);
    this.dryGainNode.gain.setTargetAtTime(isEnhanced ? 0 : 1, now, 0.03);
    this.wetGainNode.gain.setTargetAtTime(isEnhanced ? 1 : 0, now, 0.03);
  }

  // Studio Audio Enhancement Methods
  async runAudioEnhancement(): Promise<void> {
    const audioPath = this.extractedAudioPath();
    if (!audioPath) {
      alert('يرجى استيراد فيديو أو مشروع أولاً لمعالجة الصوت');
      return;
    }
    this.audioEnhancing.set(true);
    this.audioEnhanceSuccess.set(false);
    this.progressMessage.set('جاري تنقية الصوت بالذكاء الاصطناعي وعزل الضوضاء والصدى...');
    try {
      const res = await this.ipcService.enhanceAudio(audioPath, {
        strength: this.audioEnhanceStrength(),
        mode: this.audioEnhanceProfile()
      });
      if (res && res.success) {
        this.audioEnhanced.set(true);
        this.audioEnhanceSuccess.set(true);
        this.updateLiveAudioFilter();
      }
    } catch (error: any) {
      console.error('Audio enhancement failed:', error);
      alert(`حدث خطأ أثناء تنقية الصوت: ${error.message || error}`);
    } finally {
      this.audioEnhancing.set(false);
    }
  }

  toggleAudioEnhanced(): void {
    this.audioEnhanced.update(v => !v);
    this.updateLiveAudioFilter();
  }

  setAudioEnhanceProfile(profile: 'studio' | 'podcast' | 'clean'): void {
    this.audioEnhanceProfile.set(profile);
    if (profile === 'studio') {
      this.audioEnhanceStrength.set(0.85);
      if (this.warmthEq && this.presenceEq) {
        this.warmthEq.gain.value = 2.5;
        this.presenceEq.gain.value = 3.5;
      }
    } else if (profile === 'podcast') {
      this.audioEnhanceStrength.set(0.95);
      if (this.warmthEq && this.presenceEq) {
        this.warmthEq.gain.value = 3.8;
        this.presenceEq.gain.value = 2.8;
      }
    } else if (profile === 'clean') {
      this.audioEnhanceStrength.set(0.65);
      if (this.warmthEq && this.presenceEq) {
        this.warmthEq.gain.value = 1.0;
        this.presenceEq.gain.value = 2.0;
      }
    }
  }

  // Timeline View Mode: 'paragraphs' (جمل وفقرات مترابطة) vs 'words' (كلمات مفردة)
  transcriptViewMode = signal<'paragraphs' | 'words'>('paragraphs');

  // Word Editing Modal
  editingWord = signal<TranscriptWord | null>(null);
  editingWordText = signal<string>('');

  // Paragraph Bulk Editing Modal
  editingParagraph = signal<TranscriptParagraph | null>(null);
  editingParagraphText = signal<string>('');

  // Computed Paragraphs: Group individual words into natural sentences and phrases
  paragraphs = computed<TranscriptParagraph[]>(() => {
    const currentEdl = this.edl();
    if (!currentEdl || !currentEdl.transcript || currentEdl.transcript.length === 0) return [];

    const words = currentEdl.transcript;
    const result: TranscriptParagraph[] = [];
    let currentWords: TranscriptWord[] = [];
    let startIndex = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (currentWords.length === 0) {
        startIndex = i;
      }
      currentWords.push(w);

      const nextW = i < words.length - 1 ? words[i + 1] : null;
      const isPause = nextW ? (nextW.kind === 'silence' || (nextW.start - w.end >= 0.4)) : true;
      const endsSentence = /[.?!،؟!]/.test(w.text);
      const isMaxLength = currentWords.filter(cw => cw.kind !== 'silence').length >= 10;
      const isSilenceBoundary = w.kind === 'silence' && currentWords.some(cw => cw.kind !== 'silence');

      if (!nextW || isPause || endsSentence || isMaxLength || isSilenceBoundary) {
        const spoken = currentWords.filter(cw => cw.kind !== 'silence');
        const text = spoken.length > 0 ? spoken.map(cw => cw.text).join(' ') : currentWords.map(cw => cw.text).join(' ');
        const allRemoved = currentWords.every(cw => cw.removed);
        const hasRemoved = currentWords.some(cw => cw.removed);
        const flaggedWords = currentWords.filter(cw => cw.kind !== 'silence' && this.isFlaggedWord(cw));
        result.push({
          id: `para_${result.length + 1}`,
          startIndex,
          endIndex: i + 1,
          start: currentWords[0].start,
          end: currentWords[currentWords.length - 1].end,
          text,
          words: [...currentWords],
          hasRemoved,
          allRemoved,
          hasFlagged: flaggedWords.length > 0,
          flaggedCount: flaggedWords.length
        });
        currentWords = [];
      }
    }

    if (this.filterStuttersOnly()) {
      return result.filter(p => p.hasFlagged);
    }

    return result;
  });

  currentActiveParagraph = computed<TranscriptParagraph | null>(() => {
    const time = this.currentTime();
    return this.paragraphs().find(p => time >= p.start && time <= p.end) || null;
  });

  // Recent Projects
  recentProjects = signal<Array<{ path: string; name: string; date: string; videoName?: string; videoPath?: string }>>([]);

  // Export Signals
  exportFormats = signal<AspectRatio[]>(['16:9', '9:16']);
  isExporting = signal<boolean>(false);
  exportMessage = signal<string>('');
  exportSuccessDialog = signal<boolean>(false);
  lastExportedPath = signal<string>('');

  constructor(
    public edlService: EdlService,
    private projectService: ProjectService,
    private ipcService: IpcService
  ) {
    this.ipcService.onProgress((progress: any) => {
      this.progress.set(progress.progress);
      this.progressMessage.set(progress.message);

      if (progress.step === 'proxy') this.currentPipelineStep.set(2);
      else if (progress.step === 'audio') this.currentPipelineStep.set(3);
      else if (progress.step === 'transcribe') this.currentPipelineStep.set(4);
      else if (progress.step === 'silence' || progress.step === 'fillers') this.currentPipelineStep.set(5);
      else if (progress.step === 'export') this.exportMessage.set(progress.message);
    });

    this.loadCaptionStyles();
    this.loadRecentProjects();
    this.autoRestoreLastSession();
  }

  // Auto-restore last session if the app reloaded or was restarted
  async autoRestoreLastSession(): Promise<void> {
    try {
      const lastPath = localStorage.getItem('kemi_last_active_project');
      if (lastPath) {
        const exists = await this.projectService.hasProject(lastPath);
        if (exists && !this.edl()) {
          console.log('[AutoRestore] Restoring last active project:', lastPath);
          const edl = await this.projectService.loadProject(lastPath);
          if (edl && edl.sources && edl.sources.length > 0) {
            await this.restoreProject(edl, lastPath);
          }
        }
      }
    } catch (e) {
      console.warn('[AutoRestore] Could not restore last session:', e);
    }
  }

  async loadCaptionStyles(): Promise<void> {
    try {
      const styles = await this.ipcService.getCaptionStyles();
      if (styles && styles.length > 0) {
        this.captionStyles.set(styles);
      }
    } catch {}
  }

  // Return to Welcome/Home screen from Studio
  async goToHomeScreen(): Promise<void> {
    const currentEdl = this.edl();
    if (currentEdl && this.projectPath()) {
      try {
        await this.projectService.saveProject(currentEdl);
      } catch (err) {
        console.warn('Could not auto-save before going home:', err);
      }
    }

    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.pause();
    }
    this.isPlaying.set(false);
    this.stopPlaybackLoop();

    this.edl.set(null);
    this.videoUrl.set('');
    localStorage.removeItem('kemi_last_active_project');
    this.loadRecentProjects();
  }

  // Recent Projects: Persist up to 25 projects in localStorage
  loadRecentProjects(): void {
    try {
      const stored = localStorage.getItem('kemi_recent_projects');
      if (stored) {
        const projects = JSON.parse(stored);
        this.recentProjects.set(Array.isArray(projects) ? projects.slice(0, 25) : []);
      }
    } catch {}
  }

  saveRecentProject(projectPath: string, videoPath?: string): void {
    try {
      const name = projectPath.split(/[\\/]/).pop() || projectPath;
      const videoName = videoPath ? videoPath.split(/[\\/]/).pop() : undefined;
      const date = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const entry = { path: projectPath, name, date, videoName, videoPath };

      const current = this.recentProjects();
      const filtered = current.filter(p => p.path !== projectPath && (!videoPath || p.videoPath !== videoPath));
      const updated = [entry, ...filtered].slice(0, 25);
      this.recentProjects.set(updated);
      localStorage.setItem('kemi_recent_projects', JSON.stringify(updated));
      localStorage.setItem('kemi_last_active_project', projectPath);
    } catch {}
  }

  removeRecentProject(event: MouseEvent, projectPath: string): void {
    event.stopPropagation();
    try {
      const updated = this.recentProjects().filter(p => p.path !== projectPath);
      this.recentProjects.set(updated);
      localStorage.setItem('kemi_recent_projects', JSON.stringify(updated));
      if (localStorage.getItem('kemi_last_active_project') === projectPath) {
        localStorage.removeItem('kemi_last_active_project');
      }
    } catch {}
  }

  async deleteProjectPermanently(event: MouseEvent, project: any): Promise<void> {
    event.stopPropagation();
    const confirmed = confirm(`هل أنت متأكد من رغبتك في حذف مجلد المشروع "${project.name}" نهائياً من القرص الصلب؟\nالمسار:\n${project.path}\n\nتنبيه: سيتم نقل المجلد إلى سلة المحذوفات أو حذفه بالكامل ولا يمكن التراجع.`);
    if (!confirmed) return;

    try {
      await this.ipcService.deleteProject(project.path);
      this.removeRecentProject(event, project.path);
    } catch (err: any) {
      alert(`حدث خطأ أثناء حذف المشروع: ${err.message || err}`);
    }
  }

  revealProjectFolder(event: MouseEvent, folderPath: string): void {
    event.stopPropagation();
    if (folderPath) {
      this.ipcService.openFolder(folderPath).catch(() => {});
    }
  }

  async openExistingProjectFolder(): Promise<void> {
    try {
      const folderPath = await this.ipcService.selectFolder();
      if (!folderPath) return;

      const hasSavedProject = await this.projectService.hasProject(folderPath);
      if (hasSavedProject) {
        await this.openRecentProject({
          path: folderPath,
          name: folderPath.split(/[\\/]/).pop() || folderPath,
          date: 'الآن'
        });
      } else {
        alert('لم يتم العثور على ملف project.json صالح في هذا المجلد. يرجى اختيار مجلد مشروع سبق إنشاؤه.');
      }
    } catch (err: any) {
      alert(`تعذر فتح المجلد: ${err.message || err}`);
    }
  }

  async restoreProject(loadedEdl: any, projectPath: string): Promise<void> {
    if (!loadedEdl || !loadedEdl.sources || loadedEdl.sources.length === 0) return;

    this.projectPath.set(projectPath);
    this.projectService.setProjectPath(projectPath);
    await this.ipcService.setProjectPath(projectPath);

    if (loadedEdl.transcript && loadedEdl.transcript.length > 0) {
      const hasSilences = loadedEdl.transcript.some((w: any) => w.kind === 'silence');
      if (!hasSilences) {
        loadedEdl.transcript = this.edlService.buildTranscriptWithSilences(loadedEdl.transcript, this.silenceThreshold());
      }
    }

    this.edlService.setEdl(loadedEdl);
    // CRITICAL: Recompute segments from transcript removal state on every restore!
    // Without this, segments from saved JSON may be stale and syncPlayback won't skip removed words.
    this.edlService.computeSegments();
    const restoredEdl = this.edlService.getEdl();
    this.edl.set(this.deepCopyEdl(restoredEdl || loadedEdl));

    const mainSource = loadedEdl.sources.find((s: any) => s.isMainAudio) || loadedEdl.sources[0];
    const videoFile = mainSource.proxy || mainSource.path;
    this.videoUrl.set(`file://${videoFile}`);

    // If audio was previously extracted, set it (standard path is projectPath/audio/{id}.wav)
    const expectedAudio = `${projectPath}/audio/${mainSource.id}.wav`;
    this.extractedAudioPath.set(expectedAudio);

    const hasTrans = !!(loadedEdl.transcript && loadedEdl.transcript.length > 0);
    this.hasTranscribed.set(hasTrans);
    this.aiCutsApplied.set(this.edlService.hasAppliedCuts() || hasTrans);

    // If audio enhancement was previously applied, restore that state
    if (loadedEdl.audioEnhanced) {
      this.audioEnhanced.set(true);
    }

    // Check if AI multicam output exists next to the video and auto-link it
    this.autoLinkAiMulticamOutputs(loadedEdl);

    this.updateStats();
    this.saveRecentProject(projectPath, mainSource.path);
    localStorage.setItem('kemi_last_active_project', projectPath);

    const segments = this.edl()?.segments;
    if (segments && segments.length > 0) {
      setTimeout(() => this.seekToTime(segments[0].srcStart), 150);
    }
  }

  async openRecentProject(project: { path: string; name: string; date: string; videoName?: string; videoPath?: string }): Promise<void> {
    this.processing.set(true);
    this.progressMessage.set('جاري فتح المشروع المحفوظ واستعادة التقدم...');

    try {
      const hasSavedProject = await this.projectService.hasProject(project.path);
      if (hasSavedProject) {
        const loadedEdl = await this.projectService.loadProject(project.path);
        if (loadedEdl && loadedEdl.sources && loadedEdl.sources.length > 0) {
          await this.restoreProject(loadedEdl, project.path);
          return;
        }
      }

      // If no project.json exists yet, fallback to re-import
      this.projectPath.set(project.path);
      await this.ipcService.setProjectPath(project.path);
      await this.projectService.createProject(project.path);
      if (project.videoPath) {
        await this.importVideos([project.videoPath]);
      } else {
        await this.importVideos();
      }
    } catch (err: any) {
      console.error('Error opening project:', err);
      alert(`حدث خطأ أثناء فتح المشروع: ${err.message || err}`);
    } finally {
      this.processing.set(false);
    }
  }

  async selectProjectFolder(): Promise<void> {
    const folder = await this.ipcService.selectFolder();
    if (folder) {
      this.projectPath.set(folder);
      await this.ipcService.setProjectPath(folder);
      await this.projectService.createProject(folder);

      // Check if this folder already has an existing project
      const hasSaved = await this.projectService.hasProject(folder);
      if (hasSaved) {
        try {
          const edl = await this.projectService.loadProject(folder);
          if (edl && edl.sources && edl.sources.length > 0) {
            await this.restoreProject(edl, folder);
          }
        } catch {}
      }
    }
  }

  // Fast Import: Steps 1, 2, 3 only! Video opens IMMEDIATELY without waiting for Whisper!
  async importVideos(filesToOpen?: string[]): Promise<void> {
    if (!this.projectPath()) {
      await this.selectProjectFolder();
      if (!this.projectPath()) return;
    }

    const files = filesToOpen && filesToOpen.length > 0 ? filesToOpen : await this.ipcService.openFileDialog();
    if (!files || files.length === 0) return;

    this.processing.set(true);
    this.currentPipelineStep.set(1);
    this.progress.set(10);
    this.progressMessage.set('جاري استيراد ملفات الفيديو...');

    try {
      const sources: any[] = [];
      for (let i = 0; i < files.length; i++) {
        this.progressMessage.set(`جاري قراءة الكاميرا ${i + 1} من ${files.length}...`);
        const source = await this.ipcService.importVideo(files[i]);
        sources.push(source);
      }

      sources[0].isMainAudio = true;

      // 2. Instant Direct Playback (تم إلغاء انتظار البروكسي واستخدام الفيديو الأصلي مباشرة وبسرعة فائقة)
      this.currentPipelineStep.set(2);
      this.progressMessage.set('تجهيز الفيديو الأصلي فوراً بدون انتظار...');
      for (let i = 0; i < sources.length; i++) {
        sources[i].proxy = sources[i].path;
      }

      // 3. Audio Extraction
      this.currentPipelineStep.set(3);
      this.progressMessage.set('جاري استخراج الصوت بدقة 16kHz...');
      const audioPath = await this.ipcService.extractAudio(sources[0].id);
      this.extractedAudioPath.set(audioPath);

      // Create Initial EDL (Full duration, ready to play immediately!)
      const edl = this.edlService.createEdl();
      edl.sources = sources.map((s, i) => ({
        id: s.id,
        path: files[i],
        proxy: s.proxy,
        offsetSec: 0,
        isMainAudio: i === 0
      }));

      this.edlService.computeSegments();
      this.edl.set(edl);
      this.videoUrl.set(`file://${sources[0].proxy}`);
      this.hasTranscribed.set(false);
      this.aiCutsApplied.set(false);

      // Save to recent projects
      this.saveRecentProject(this.projectPath(), files[0]);

      this.updateStats();
      await this.projectService.saveProject(edl);
    } catch (error: any) {
      console.error('Error importing videos:', error);
      alert(`حدث خطأ أثناء استيراد الفيديوهات: ${error.message || error}`);
    } finally {
      this.processing.set(false);
    }
  }

  // Step 4 (On-Demand): Run AI Whisper Transcription & Silence Analysis only when requested!
  async runAiTranscription(): Promise<void> {
    const edl = this.edl();
    const audioPath = this.extractedAudioPath();
    if (!edl || !audioPath) return;

    this.processing.set(true);
    this.currentPipelineStep.set(4);
    this.progress.set(10);
    this.progressMessage.set('جاري تشغيل تفريغ الصوت بالذكاء الاصطناعي (Whisper)...');

    try {
      const transcription = await this.ipcService.transcribe(audioPath, {
        language: 'ar',
        modelSize: this.modelSize()
      });

      // 5. Detect Fillers and Repeats
      this.currentPipelineStep.set(5);
      this.progressMessage.set('جاري فحص كلمات التعبئة والوقفات...');
      const fillerResult = await this.ipcService.detectFillers(
        transcription.words,
        this.fillerWordsList()
      );

      // Mark words detected by AI (fillers, repeats, stutters, retakes, elongations)
      const fillerSet = new Set(fillerResult.fillerIds || []);
      const repeatSet = new Set(fillerResult.repeatIds || []);
      const stutterSet = new Set(fillerResult.stutterIds || []);
      const retakeSet = new Set(fillerResult.retakeIds || []);
      const elongationSet = new Set(fillerResult.elongationIds || []);

      const fillerList = this.fillerWordsList().map(f => f.trim().toLowerCase());
      const rawWords: TranscriptWord[] = transcription.words.map((w: any) => {
        const textClean = (w.text || '').trim().toLowerCase();
        const isElongated = elongationSet.has(w.id) || this.isElongatedWord(w);
        const isStutter = stutterSet.has(w.id) || this.isStutterWord(w);
        const isFillerWord = (w.kind === 'filler') || fillerList.includes(textClean) || fillerSet.has(w.id);

        let reason: any = null;
        if (isStutter) reason = 'stutter';
        else if (isElongated) reason = 'elongation';
        else if (fillerSet.has(w.id) || isFillerWord) reason = 'filler';
        else if (repeatSet.has(w.id)) reason = 'repeat';
        else if (retakeSet.has(w.id)) reason = 'retake';

        return {
          ...w,
          kind: (isFillerWord || isStutter || isElongated) ? 'filler' : (w.kind || 'word'),
          removed: false, // 100% PRESERVED: Never cut any word or video segment automatically!
          removeReason: reason
        };
      });

      // Insert silences between words based on silence threshold
      edl.transcript = this.edlService.buildTranscriptWithSilences(rawWords, this.silenceThreshold());

      // Synchronize with EDL Service: Keep the full original video 100% intact!
      this.edlService.setEdl(edl);
      this.edlService.computeSegments();
      const updatedEdl = this.edlService.getEdl();
      if (updatedEdl) {
        this.edl.set(this.deepCopyEdl(updatedEdl));
      }

      this.hasTranscribed.set(true);
      this.aiCutsApplied.set(false); // Original full video playback active by default!

      // Calculate stats
      const fillerCount = (fillerResult.fillerIds || []).length;
      const repeatCount = (fillerResult.repeatIds || []).length;
      const stutterCount = (fillerResult.stutterIds || []).length;
      const retakeCount = (fillerResult.retakeIds || []).length;
      this.detectedCutsStats.set({
        count: fillerCount + repeatCount + stutterCount + retakeCount,
        savedSec: Math.round(edl.transcript.length * 0.18)
      });

      this.updateStats();
      await this.projectService.saveProject(this.edl() || edl);

      // Move playhead to start of first active segment
      const segments = this.edl()?.segments;
      if (segments && segments.length > 0) {
        this.seekToTime(segments[0].srcStart);
      }
    } catch (error: any) {
      console.error('Transcription error:', error);
      alert(`حدث خطأ أثناء التفريغ الصوتي: ${error.message || error}`);
    } finally {
      this.processing.set(false);
    }
  }

  // Apply AI Cuts: Cuts out silences & fillers and activates seamless segment-by-segment playback
  applyAiCuts(): void {
    const res = this.edlService.applyAiCuts(this.fillerWordsList());
    const finalEdl = this.edlService.getEdl();
    if (finalEdl) {
      this.edl.set(this.deepCopyEdl(finalEdl));
      this.projectService.saveProject(finalEdl);
    }
    this.aiCutsApplied.set(true);
    this.updateStats();

    // Reset video to start of first active segment
    const video = this.videoPlayerRef?.nativeElement;
    const segments = this.edl()?.segments;
    if (video && segments && segments.length > 0) {
      video.currentTime = segments[0].srcStart;
      this.currentTime.set(segments[0].srcStart);
      this.timelineStore.playheadTime.set(segments[0].srcStart);
    }
  }

  revertAiCuts(): void {
    this.edlService.restoreAll();
    const finalEdl = this.edlService.getEdl();
    if (finalEdl) {
      this.edl.set(this.deepCopyEdl(finalEdl));
      this.projectService.saveProject(finalEdl);
    }
    this.aiCutsApplied.set(false);
    this.updateStats();
  }

  updateStats(): void {
    this.originalDuration.set(this.edlService.getOriginalDuration() || this.videoDuration());
    this.newDuration.set(this.edlService.getTotalDuration() || this.videoDuration());
    this.timeSaved.set(this.edlService.getTimeSaved());
    this.timeSavedPercentage.set(this.edlService.getTimeSavedPercentage());
  }

  // Word Toggles & Cuts
  toggleWord(word: TranscriptWord): void {
    this.edlService.toggleWord(word.id);
    const finalEdl = this.edlService.getEdl();
    if (finalEdl) {
      this.edl.set(this.deepCopyEdl(finalEdl));
      this.projectService.saveProject(finalEdl);
    }
    this.aiCutsApplied.set(this.edlService.hasAppliedCuts());
    this.updateStats();
    this.seekToTime(word.start);
  }

  seekToWord(word: TranscriptWord, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.seekToTime(word.start);
  }

  restoreAllScriptWords(): void {
    this.edlService.restoreAll();
    const curEdl = this.edlService.getEdl();
    if (curEdl) {
      this.edl.set(this.deepCopyEdl(curEdl));
      this.projectService.saveProject(curEdl);
    }
    this.updateStats();
  }

  isElongatedWord(word: TranscriptWord): boolean {
    if (!word || !word.text) return false;
    const t = word.text.replace(/[\s.,!؟،_ـ\-:؛"\'()]+/g, '').trim();
    return /(.)\1{2,}/u.test(t) || /^[اآإأ](?:ي{2,}|ا{2,}|م{2,}|ه{2,}|و{2,})/u.test(t);
  }

  isStutterWord(word: TranscriptWord): boolean {
    if (!word || !word.text) return false;
    const t = word.text.trim();
    return /^[^\s]+[-ـ]$/u.test(t) || word.removeReason === 'stutter';
  }

  isFlaggedWord(word: TranscriptWord): boolean {
    if (!word) return false;
    return (
      word.removeReason === 'stutter' ||
      word.removeReason === 'repeat' ||
      word.removeReason === 'elongation' ||
      word.kind === 'filler' ||
      word.removeReason === 'filler' ||
      this.isStutterWord(word) ||
      this.isElongatedWord(word)
    );
  }

  toggleFilterStutters(): void {
    this.filterStuttersOnly.set(!this.filterStuttersOnly());
  }

  navigateToNextFlaggedWord(): void {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) return;
    const flagged = curEdl.transcript.filter(w => this.isFlaggedWord(w));
    if (flagged.length === 0) return;
    const nextIdx = (this.currentFlaggedIndex() + 1) % flagged.length;
    this.currentFlaggedIndex.set(nextIdx);
    const targetWord = flagged[nextIdx];
    this.seekToWord(targetWord);
    setTimeout(() => {
      const el = document.querySelector(`.script-word-chip[data-word-id="${targetWord.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('pulse-highlight');
        setTimeout(() => el.classList.remove('pulse-highlight'), 2200);
      }
    }, 150);
  }

  getWordTooltip(word: TranscriptWord): string {
    if (word.kind === 'silence') {
      const dur = (word.end - word.start).toFixed(2);
      const status = word.removed ? '✂️ محذوفة من الفيديو' : '👁️ متروكة في الفيديو';
      return `فترة سكتة (${dur}ث) [${status}] | انقر للتبديل بين الحذف والإبقاء | نقر مزدوج للاستماع`;
    }
    const time = this.formatTime(word.start);
    let type = 'كلمة';
    if (word.removeReason === 'stutter' || this.isStutterWord(word)) type = 'تأتأة / تلعثم';
    else if (word.removeReason === 'elongation' || this.isElongatedWord(word)) type = 'مد صوتي';
    else if (word.removeReason === 'repeat') type = 'تكرار جملة';
    else if (word.kind === 'filler' || word.removeReason === 'filler') type = 'حشو';

    const status = word.removed ? '✂ محذوفة من الفيديو والصوت' : 'نشطة في الفيديو والصوت';
    return `${word.text} [${type}] | ${status} | توقيت: ${time} | نقر: تبديل الحذف | نقر مزدوج: استماع`;
  }

  cutAllStuttersAndElongations(): void {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) return;
    for (const w of curEdl.transcript) {
      if (this.isStutterWord(w) || this.isElongatedWord(w) || w.kind === 'filler' || w.removeReason === 'stutter' || w.removeReason === 'elongation' || w.removeReason === 'repeat') {
        w.removed = true;
        if (!w.removeReason) {
          w.removeReason = this.isElongatedWord(w) ? 'elongation' : (this.isStutterWord(w) ? 'stutter' : 'filler');
        }
      }
    }
    this.edlService.computeSegments();
    this.edl.set(this.deepCopyEdl(curEdl));
    this.updateStats();
    this.projectService.saveProject(curEdl);
  }

  // Word Editing Modal
  openEditWord(word: TranscriptWord, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingWord.set(word);
    this.editingWordText.set(word.text);
  }

  saveWordEdit(): void {
    const word = this.editingWord();
    const newText = this.editingWordText().trim();
    if (!word || !newText) {
      this.editingWord.set(null);
      return;
    }

    const currentEdl = this.edl();
    if (!currentEdl || !currentEdl.transcript) {
      this.editingWord.set(null);
      return;
    }

    const tokens = newText.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length <= 1) {
      this.edlService.updateWordText(word.id, newText);
      const updatedEdl = this.edlService.getEdl();
      if (updatedEdl) {
        this.edl.set(this.deepCopyEdl(updatedEdl));
        this.projectService.saveProject(updatedEdl);
      }
    } else {
      // Split single word into multiple words (e.g. split into "الحـ" and "الحاجة")
      const wordIdx = currentEdl.transcript.findIndex(w => w.id === word.id);
      if (wordIdx !== -1) {
        const totalDuration = Math.max(0.08, word.end - word.start);
        const totalChars = tokens.reduce((acc, t) => acc + Math.max(1, t.length), 0);
        let curStart = word.start;

        const newWords: TranscriptWord[] = tokens.map((tok, idx) => {
          const frac = Math.max(1, tok.length) / totalChars;
          const dur = Math.max(0.04, totalDuration * frac);
          const wEnd = (idx === tokens.length - 1) ? word.end : Math.min(word.end, curStart + dur);
          const nw: TranscriptWord = {
            id: `w_sub_${Date.now()}_${idx}`,
            text: tok,
            start: Math.round(curStart * 1000) / 1000,
            end: Math.round(wEnd * 1000) / 1000,
            kind: /^[^\s]+[-ـ]$/u.test(tok) ? 'filler' : 'word',
            removed: false,
            removeReason: /^[^\s]+[-ـ]$/u.test(tok) ? 'stutter' : null
          };
          curStart = wEnd;
          return nw;
        });

        currentEdl.transcript.splice(wordIdx, 1, ...newWords);
        this.edlService.setEdl(currentEdl);
        this.edlService.computeSegments();
        this.edl.set(this.deepCopyEdl(currentEdl));
        this.projectService.saveProject(currentEdl);
      }
    }
    this.editingWord.set(null);
  }

  cancelWordEdit(): void {
    this.editingWord.set(null);
  }

  // Paragraph Bulk Editing Methods
  openEditParagraph(paragraph: TranscriptParagraph, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.editingParagraph.set(paragraph);
    this.editingParagraphText.set(paragraph.text);
  }

  cancelParagraphEdit(): void {
    this.editingParagraph.set(null);
  }

  saveParagraphEdit(): void {
    const para = this.editingParagraph();
    if (!para) return;

    const newText = this.editingParagraphText().trim();
    if (!newText) {
      this.cancelParagraphEdit();
      return;
    }

    const currentEdl = this.edl();
    if (!currentEdl) return;

    const newTokens = newText.split(/\s+/).filter(t => t.length > 0);
    if (newTokens.length === 0) {
      this.cancelParagraphEdit();
      return;
    }

    const oldWords = para.words;
    const pStart = para.start;
    const pEnd = para.end;
    const totalDuration = Math.max(0.1, pEnd - pStart);

    let updatedWords: TranscriptWord[] = [];

    if (newTokens.length === oldWords.length) {
      // 1-to-1 match: preserve existing start/end per word
      updatedWords = oldWords.map((ow, idx) => {
        const tok = newTokens[idx];
        const isStutter = /^[^\s]+[-ـ]$/u.test(tok);
        return {
          ...ow,
          text: tok,
          kind: isStutter ? 'filler' : ow.kind,
          removeReason: isStutter ? 'stutter' : ow.removeReason
        };
      });
    } else {
      // Word count changed: proportionally distribute time by character lengths
      const totalChars = newTokens.reduce((sum, token) => sum + Math.max(1, token.length), 0);
      let curStart = pStart;

      updatedWords = newTokens.map((token, idx) => {
        const fraction = Math.max(1, token.length) / totalChars;
        const duration = Math.max(0.08, totalDuration * fraction);
        const wEnd = (idx === newTokens.length - 1) ? pEnd : Math.min(pEnd, curStart + duration);
        const isStutter = /^[^\s]+[-ـ]$/u.test(token);
        const newWord: TranscriptWord = {
          id: `w_p_${para.id}_${idx}_${Date.now()}`,
          text: token,
          start: Math.round(curStart * 1000) / 1000,
          end: Math.round(wEnd * 1000) / 1000,
          kind: isStutter ? 'filler' : 'word',
          removed: false,
          removeReason: isStutter ? 'stutter' : null
        };
        curStart = wEnd;
        return newWord;
      });
    }

    const transcript = [...currentEdl.transcript];
    transcript.splice(para.startIndex, para.endIndex - para.startIndex, ...updatedWords);
    currentEdl.transcript = transcript;

    this.edlService.computeSegments();
    this.edl.set(this.deepCopyEdl(currentEdl));
    this.editingParagraph.set(null);
    this.projectService.saveProject(currentEdl);
  }

  toggleParagraphCut(paragraph: TranscriptParagraph, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const currentEdl = this.edl();
    if (!currentEdl) return;

    const newRemoved = !paragraph.allRemoved;
    for (let i = paragraph.startIndex; i < paragraph.endIndex; i++) {
      if (currentEdl.transcript[i]) {
        currentEdl.transcript[i].removed = newRemoved;
        currentEdl.transcript[i].removeReason = newRemoved ? 'manual' : null;
      }
    }

    this.edlService.computeSegments();
    this.edl.set(this.deepCopyEdl(currentEdl));
    this.updateStats();
    this.projectService.saveProject(currentEdl);
  }

  setSilencePreset(preset: 'gentle' | 'normal' | 'aggressive'): void {
    this.silencePreset.set(preset);
    let sec = 0.4;
    if (preset === 'gentle') {
      sec = 0.6;
      this.edlService.minSilenceLength = 0.6;
      this.edlService.paddingSec = 0.16;
    } else if (preset === 'normal') {
      sec = 0.4;
      this.edlService.minSilenceLength = 0.4;
      this.edlService.paddingSec = 0.12;
    } else if (preset === 'aggressive') {
      sec = 0.25;
      this.edlService.minSilenceLength = 0.25;
      this.edlService.paddingSec = 0.08;
    }
    this.silenceThreshold.set(sec);
    this.edlService.insertSilences(sec);
    const curEdl = this.edlService.getEdl();
    if (curEdl) {
      this.edl.set(this.deepCopyEdl(curEdl));
      this.projectService.saveProject(curEdl);
    }
    this.updateStats();
  }

  setSilenceThreshold(sec: number): void {
    this.silenceThreshold.set(sec);
    this.edlService.minSilenceLength = sec;
    this.edlService.insertSilences(sec);
    const curEdl = this.edlService.getEdl();
    if (curEdl) {
      this.edl.set(this.deepCopyEdl(curEdl));
      this.projectService.saveProject(curEdl);
    }
    this.updateStats();
  }

  onSilenceThresholdSliderChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val) && val >= 0.2) {
      this.setSilenceThreshold(Number(val.toFixed(2)));
    }
  }

  cutAllSilences(): void {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) return;
    this.edlService.setAllSilencesRemoved(true);
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.aiCutsApplied.set(this.edlService.hasAppliedCuts());
    this.updateStats();
  }

  cutLongSilencesOnly(thresholdSec: number = 0.8): void {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) return;
    this.edlService.removeLongSilences(thresholdSec);
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.aiCutsApplied.set(this.edlService.hasAppliedCuts());
    this.updateStats();
  }

  keepAllSilences(): void {
    const curEdl = this.edl();
    if (!curEdl || !curEdl.transcript) return;
    this.edlService.setAllSilencesRemoved(false);
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.aiCutsApplied.set(this.edlService.hasAppliedCuts());
    this.updateStats();
  }

  toggleAlternatingZoom(): void {
    const nextVal = !this.enableAlternatingZoom();
    this.enableAlternatingZoom.set(nextVal);
    this.edlService.enableAlternatingZoom = nextVal;
    this.edlService.computeSegments();
  }

  // =====================================================================
  // VIRTUAL MULTI-CAMERA MANAGEMENT (Single Video Multi-Angle)
  // =====================================================================

  /** Add a new virtual camera angle to the current video */
  addVirtualCamera(): void {
    const curEdl = this.edl();
    if (!curEdl) return;

    const count = this.virtualCameras().length;
    let defaultZoom = 1.18;
    let defaultName = `زاوية 3D رقم ${count + 1}`;
    let defaultRotateY = 5.0;
    let defaultPanX = -3;
    if (count % 2 === 0) {
      defaultRotateY = -5.0;
      defaultPanX = 3;
    }

    this.edlService.addVirtualCamera(defaultName, defaultZoom, defaultPanX, 0, defaultRotateY, 0);
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
  }

  /** Remove a virtual camera angle */
  removeVirtualCamera(id: string): void {
    const curEdl = this.edl();
    if (!curEdl || id === 'cam1') return;

    this.edlService.removeVirtualCamera(id);
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
  }

  /** Update virtual camera zoom */
  onVirtualCameraZoomChange(id: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.edlService.updateVirtualCamera(id, { zoom: val });
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    // Update live monitor preview immediately
    this.activeSegmentZoom.set(val);
  }

  /** Update virtual camera 3D Yaw angle (rotation around Y axis) */
  onVirtualCameraRotateYChange(id: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.edlService.updateVirtualCamera(id, { rotateY: val });
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.activeSegmentRotateY.set(val);
  }

  /** Update virtual camera horizontal pan */
  onVirtualCameraPanXChange(id: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.edlService.updateVirtualCamera(id, { panX: val });
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.activeSegmentPanX.set(val);
  }

  /** Update virtual camera name */
  updateVirtualCameraName(id: string, name: string): void {
    if (!name.trim()) return;
    this.edlService.updateVirtualCamera(id, { name: name.trim() });
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
  }

  /** Preview a specific camera angle in the studio monitor */
  previewVirtualCamera(cam: VirtualCamera): void {
    this.activeSegmentZoom.set(cam.zoom);
    this.activeSegmentPanX.set(cam.panX || 0);
    this.activeSegmentPanY.set(cam.panY || 0);
    this.activeSegmentRotateY.set(cam.rotateY || 0);
    this.activeSegmentRotateX.set(cam.rotateX || 0);
    this.activeCameraName.set(cam.name);

    // If an AI-rendered video exists for this camera, display it without interrupting audio or reloading master
    if (cam.renderedVideoPath) {
      const fileUrl = `file://${cam.renderedVideoPath.replace(/\\/g, '/')}`;
      this.activeCameraVideoUrl.set(fileUrl);
      setTimeout(() => {
        const master = this.videoPlayerRef?.nativeElement;
        const aiPlayer = this.aiCameraPlayerRef?.nativeElement;
        if (master && aiPlayer) {
          aiPlayer.currentTime = master.currentTime;
          if (!master.paused) aiPlayer.play().catch(() => {});
        }
      }, 30);
    } else {
      this.activeCameraVideoUrl.set('');
    }
  }

  /** Run auto-distribution of virtual camera angles across segments */
  autoDistributeCameras(): void {
    const curEdl = this.edl();
    if (!curEdl) return;

    this.edlService.autoAssignCameras(
      this.autoSwitchIntervalSec(),
      this.autoSwitchPattern()
    );
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.autoSwitchEnabled.set(true);
  }

  /** Reset all segments to the main wide camera (cam1) */
  resetCameras(): void {
    const curEdl = this.edl();
    if (!curEdl) return;

    this.edlService.resetCameraAssignments();
    const updated = this.edlService.getEdl();
    if (updated) {
      this.edl.set(this.deepCopyEdl(updated));
      this.projectService.saveProject(updated);
    }
    this.autoSwitchEnabled.set(false);
  }

  /** Update auto-switch interval and re-distribute if enabled */
  onAutoSwitchIntervalChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.autoSwitchIntervalSec.set(val);
    if (this.autoSwitchEnabled()) {
      this.autoDistributeCameras();
    }
  }

  /** Set auto-switch pattern */
  setAutoSwitchPattern(pattern: 'alternate-cuts' | 'sequential' | 'random' | 'smart'): void {
    this.autoSwitchPattern.set(pattern);
    if (this.autoSwitchEnabled()) {
      this.autoDistributeCameras();
    }
  }

  // ─── AI Multi-Camera Methods ───────────────────────────────────────────

  /** Start AI 3D multi-camera generation */
  startAiMulticamGeneration(): void {
    const edl = this.edl();
    if (!edl || !edl.sources || edl.sources.length === 0) return;

    const source = edl.sources[0];
    const inputPath = (source as any).originalPath || source.path;
    if (!inputPath) return;

    // Build output directory next to the source video
    const sourceDirParts = inputPath.replace(/\\/g, '/').split('/');
    sourceDirParts.pop();
    const sourceDir = sourceDirParts.join('/');
    const outputDir = sourceDir + '/ai_multicam_output';

    // Build camera configs from virtual cameras
    const cameras = this.virtualCameras().map(cam => ({
      id: cam.id,
      name: cam.name,
      yaw: cam.rotateY || 0,
      pitch: cam.rotateX || 0,
      zoom: cam.zoom || 1,
      panX: cam.panX || 0,
      panY: cam.panY || 0
    }));

    this.aiMulticamStatus.set('processing');
    this.aiMulticamPercent.set(0);
    this.aiMulticamFrame.set(0);
    this.aiMulticamError.set('');
    this.aiMulticamOutputDir.set(outputDir);

    // Listen for progress updates
    const api = (window as any).electronAPI;
    if (!api?.generateMulticamViews) {
      this.aiMulticamStatus.set('error');
      this.aiMulticamError.set('Electron API not available. Run inside Electron.');
      return;
    }

    // Register progress listener
    if (api.onMulticamProgress) {
      api.onMulticamProgress((progress: any) => {
        this.aiMulticamPercent.set(progress.percent || 0);
        this.aiMulticamFrame.set(progress.frame || 0);
        this.aiMulticamTotalFrames.set(progress.totalFrames || 0);
        this.aiMulticamEta.set(progress.etaSeconds || 0);
      });
    }

    // Start generation
    api.generateMulticamViews({
      inputPath,
      outputDir,
      cameras,
      mode: this.aiMulticamMode(),
      unmirrorSelfie: this.aiUnmirrorSelfie()
    }).then((result: any) => {
      if (result.success) {
        this.aiMulticamStatus.set('complete');
        this.aiMulticamCameraCount.set(cameras.length);
        this.aiMulticamPercent.set(100);

        // Attach rendered video paths to the virtual cameras in EDL
        const outputs = result.result?.h264Outputs || result.result?.outputs || {};
        const curEdl = this.edl();
        if (curEdl && curEdl.virtualCameras) {
          for (const cam of curEdl.virtualCameras) {
            if (outputs[cam.id]) {
              cam.renderedVideoPath = outputs[cam.id];
            }
          }
          // Activate multi-angle playback on timeline
          this.aiCutsApplied.set(true);
          this.edlService.computeSegments();
          this.edlService.autoAssignCameras(this.autoSwitchIntervalSec(), this.autoSwitchPattern());
          const updated = this.edlService.getEdl() || curEdl;
          this.edl.set(this.deepCopyEdl(updated));
          this.projectService.saveProject(updated);
        }
      } else {
        this.aiMulticamStatus.set('error');
        this.aiMulticamError.set(result.error || 'Unknown error');
      }
    }).catch((err: any) => {
      this.aiMulticamStatus.set('error');
      this.aiMulticamError.set(err.message || 'Process failed');
    });
  }

  /** Cancel ongoing AI multicam generation */
  cancelAiMulticam(): void {
    const api = (window as any).electronAPI;
    if (api?.cancelMulticam) {
      api.cancelMulticam();
    }
    this.aiMulticamStatus.set('idle');
    this.aiMulticamPercent.set(0);
  }

  /** Automatically check and link existing generated AI multicam outputs */
  async autoLinkAiMulticamOutputs(edl: any): Promise<void> {
    if (!edl || !edl.sources || edl.sources.length === 0) return;
    const inputPath = (edl.sources[0] as any).originalPath || edl.sources[0].path;
    if (!inputPath) return;

    const sourceDirParts = inputPath.replace(/\\/g, '/').split('/');
    sourceDirParts.pop();
    const outputDir = sourceDirParts.join('/') + '/ai_multicam_output';

    const api = (window as any).electronAPI;
    if (!api?.getMulticamOutputs) return;

    try {
      const res = await api.getMulticamOutputs(outputDir);
      if (res?.exists && Array.isArray(res.cameras) && res.cameras.length > 0) {
        const vCams = edl.virtualCameras || this.edlService.getVirtualCameras();
        let attached = false;

        for (const cam of vCams) {
          // Look for an H264 output for this camId
          const match = res.cameras.find((c: any) => c.camId === cam.id && c.isH264) ||
                        res.cameras.find((c: any) => c.camId === cam.id);
          if (match) {
            cam.renderedVideoPath = match.path;
            attached = true;
          }
        }

        if (attached) {
          edl.virtualCameras = vCams;
          this.aiMulticamStatus.set('complete');
          this.aiMulticamCameraCount.set(vCams.length);
          this.aiCutsApplied.set(true);
          this.edlService.computeSegments();
          this.edlService.autoAssignCameras(this.autoSwitchIntervalSec(), this.autoSwitchPattern());
          const updated = this.edlService.getEdl() || edl;
          this.edl.set(this.deepCopyEdl(updated));
          this.projectService.saveProject(updated);
        }
      }
    } catch (e) {
      console.warn('[AutoLinkAiMulticam] Could not check outputs:', e);
    }
  }

  addFillerWord(): void {
    const val = this.newFillerInput.trim();
    if (val && !this.fillerWordsList().includes(val)) {
      const updated = [...this.fillerWordsList(), val];
      this.fillerWordsList.set(updated);
      this.newFillerInput = '';
      if (this.aiCutsApplied()) {
        this.applyAiCuts();
      }
    }
  }

  removeFillerWord(word: string): void {
    const updated = this.fillerWordsList().filter(w => w !== word);
    this.fillerWordsList.set(updated);
    if (this.aiCutsApplied()) {
      this.applyAiCuts();
    }
  }

  // Playback Controls
  togglePlayPause(): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;
    if (video.paused) {
      // If at end, loop to beginning
      const segments = this.edl()?.segments;
      if (this.aiCutsApplied() && segments && segments.length > 0) {
        const lastSeg = segments[segments.length - 1];
        if (video.currentTime >= lastSeg.srcEnd - 0.1) {
          video.currentTime = segments[0].srcStart;
        } else if (this.skipRemovedPlayback() && video.currentTime < segments[0].srcStart - 0.04) {
          // If playhead is before first active segment (inside cut hesitation), start directly from first segment!
          video.currentTime = segments[0].srcStart;
        }
      }
      video.play();
      this.isPlaying.set(true);
      this.startPlaybackLoop();
    } else {
      video.pause();
      this.isPlaying.set(false);
      this.stopPlaybackLoop();
    }
  }

  onVideoPlay(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    this.isPlaying.set(true);
    this.startPlaybackLoop();
  }

  onVideoPause(): void {
    this.isPlaying.set(false);
    this.stopPlaybackLoop();
  }

  previewSnippetEnd: number | null = null;

  playSnippetRange(range: { start: number; end: number }): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    this.previewSnippetEnd = range.end;
    video.currentTime = range.start;
    this.currentTime.set(range.start);
    this.timelineStore.playheadTime.set(range.start);
    video.play().catch(() => {});
    this.isPlaying.set(true);
    this.startPlaybackLoop();
  }

  onTimelineSeek(time: number): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;
    this.previewSnippetEnd = null;
    if (this.cutTransitionTimeout) {
      clearTimeout(this.cutTransitionTimeout);
      this.cutTransitionTimeout = null;
    }
    this.isCutTransitioning = false;
    video.currentTime = time;
    this.currentTime.set(time);
    this.timelineStore.playheadTime.set(time);
    this.syncPlayback(video);
  }

  private playbackRafId: number | null = null;
  private isCutTransitioning = false;
  private cutTransitionTimeout: any = null;

  private jumpToSegmentStart(video: HTMLVideoElement, targetTime: number): void {
    if (this.isCutTransitioning) return;
    this.isCutTransitioning = true;

    // Instantly mute video AND Web Audio master gain before seek to prevent WSOLA bleed / stutter artifact
    const wasMuted = video.muted;
    video.muted = true;
    if (this.masterGainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.masterGainNode.gain.cancelScheduledValues(now);
        this.masterGainNode.gain.setValueAtTime(0, now);
      } catch {}
    }
    video.currentTime = targetTime;

    if (this.cutTransitionTimeout) {
      clearTimeout(this.cutTransitionTimeout);
    }

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      if (this.cutTransitionTimeout) {
        clearTimeout(this.cutTransitionTimeout);
        this.cutTransitionTimeout = null;
      }
      if (!wasMuted) {
        video.muted = false;
      }
      if (this.masterGainNode && this.audioCtx) {
        try {
          const now = this.audioCtx.currentTime;
          this.masterGainNode.gain.cancelScheduledValues(now);
          this.masterGainNode.gain.setValueAtTime(0, now);
          this.masterGainNode.gain.linearRampToValueAtTime(1, now + 0.02);
        } catch {}
      }
      this.isCutTransitioning = false;
    };

    const onSeeked = () => cleanup();
    this.cutTransitionTimeout = setTimeout(cleanup, 140);

    video.addEventListener('seeked', onSeeked, { once: true });
  }

  private startPlaybackLoop(): void {
    this.stopPlaybackLoop();
    const step = () => {
      const video = this.videoPlayerRef?.nativeElement;
      if (video && !video.paused) {
        this.syncPlayback(video);
        this.playbackRafId = requestAnimationFrame(step);
      } else {
        this.playbackRafId = null;
      }
    };
    this.playbackRafId = requestAnimationFrame(step);
  }

  private stopPlaybackLoop(): void {
    if (this.playbackRafId) {
      cancelAnimationFrame(this.playbackRafId);
      this.playbackRafId = null;
    }
    if (this.cutTransitionTimeout) {
      clearTimeout(this.cutTransitionTimeout);
      this.cutTransitionTimeout = null;
    }
    this.isCutTransitioning = false;
  }

  // High-precision smooth synchronization: prevents seek lag and ensures zero audio bleed across cuts!
  private syncPlayback(video: HTMLVideoElement): void {
    if (video.seeking || this.isCutTransitioning) return;

    const time = video.currentTime;

    // Handle single cut snippet preview
    if (this.previewSnippetEnd !== null) {
      this.currentTime.set(time);
      this.timelineStore.playheadTime.set(time);
      if (time >= this.previewSnippetEnd) {
        video.pause();
        this.isPlaying.set(false);
        this.previewSnippetEnd = null;
        this.stopPlaybackLoop();
      }
      return;
    }

    if (Math.abs(time - this.currentTime()) > 0.008 || video.paused) {
      this.currentTime.set(time);
      this.timelineStore.playheadTime.set(time);
    }

    const currentEdl = this.edl();
    if (!currentEdl) return;

    // Track active word: only active if NOT removed!
    const active = currentEdl.transcript.find(w => time >= w.start && time <= w.end);
    this.currentActiveWord.set(active && !active.removed ? active : null);

    // Auto-scroll active word into view in Script Editor if open
    if (this.activeTab() === 'script' && this.scriptAutoScroll() && active && !active.removed) {
      const activeEl = document.querySelector(`.script-word-chip[data-word-id="${active.id}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }

    // Compute active caption phrase based on wordsPerLine setting (strictly excludes removed words!)
    this.updateActiveCaptionPhrase(time, active || null);

    // Track active segment punch-in zoom & 3D perspective framing
    if (this.aiCutsApplied()) {
      const curSeg = this.edlService.getSegmentAtSourceTime(time);
      if (curSeg) {
        this.activeSegmentZoom.set(curSeg.zoom || 1.0);
        const vCam = this.edlService.getVirtualCameraById(curSeg.camera);
        this.activeSegmentPanX.set(vCam?.panX || 0);
        this.activeSegmentPanY.set(vCam?.panY || 0);
        this.activeSegmentRotateY.set(vCam?.rotateY || 0);
        this.activeSegmentRotateX.set(vCam?.rotateX || 0);
        this.activeCameraName.set(vCam?.name || 'زاوية واسعة');

        // Zero-lag AI Camera stream sync: seamlessly displays the novel viewpoint while keeping master timeline intact
        if (vCam?.renderedVideoPath) {
          const targetUrl = `file://${vCam.renderedVideoPath.replace(/\\/g, '/')}`;
          if (this.activeCameraVideoUrl() !== targetUrl) {
            this.activeCameraVideoUrl.set(targetUrl);
          }
          const aiPlayer = this.aiCameraPlayerRef?.nativeElement;
          if (aiPlayer) {
            if (Math.abs(aiPlayer.currentTime - time) > 0.08) {
              aiPlayer.currentTime = time;
            }
            if (video.paused && !aiPlayer.paused) {
              aiPlayer.pause();
            } else if (!video.paused && aiPlayer.paused) {
              aiPlayer.play().catch(() => {});
            }
          }
        } else {
          if (this.activeCameraVideoUrl() !== '') {
            this.activeCameraVideoUrl.set('');
          }
        }
      } else {
        if (this.activeCameraVideoUrl() !== '') {
          this.activeCameraVideoUrl.set('');
        }
        this.activeSegmentZoom.set(1.0);
        this.activeSegmentPanX.set(0);
        this.activeSegmentPanY.set(0);
        this.activeSegmentRotateY.set(0);
        this.activeSegmentRotateX.set(0);
        this.activeCameraName.set('زاوية واسعة');
      }
    } else {
      this.activeSegmentZoom.set(1.0);
      this.activeSegmentPanX.set(0);
      this.activeSegmentPanY.set(0);
      this.activeSegmentRotateY.set(0);
      this.activeSegmentRotateX.set(0);
      this.activeCameraName.set('زاوية واسعة');
    }

    // When cuts exist & skipping is enabled, strictly play through segments and jump over all silences & cuts!
    const shouldSkipCuts = this.skipRemovedPlayback() && this.aiCutsApplied();
    if (shouldSkipCuts && !video.paused) {
      // 1. Direct Word-Level Removal Check:
      // If current playback time is inside ANY removed word (stutter, filler, repetition), jump immediately past it!
      const removedWord = currentEdl.transcript.find(w => w.removed && time >= (w.start - 0.02) && time < w.end);
      if (removedWord) {
        const nextActive = currentEdl.transcript.find(w => !w.removed && w.start >= (removedWord.end - 0.01));
        if (nextActive) {
          this.jumpToSegmentStart(video, nextActive.start);
          return;
        }
      }

      // 2. Segment-level boundary jumping:
      const segments = (currentEdl.segments && currentEdl.segments.length > 0)
        ? currentEdl.segments
        : this.edlService.getEdl()?.segments;

      if (segments && segments.length > 0) {
        // If before first segment, jump cleanly to start of first segment
        if (time < segments[0].srcStart - 0.02) {
          this.jumpToSegmentStart(video, segments[0].srcStart);
          return;
        }

        // Check if current time is inside an active segment
        const curSeg = segments.find(s => time >= s.srcStart && time < s.srcEnd);
        if (!curSeg) {
          // Inside a cut gap! Jump directly to the start of the next segment!
          const nextSeg = segments.find(s => s.srcStart > time);
          if (nextSeg) {
            this.jumpToSegmentStart(video, nextSeg.srcStart);
            return;
          } else {
            // Past the last segment: video reached the end of the edited cut
            video.pause();
            this.isPlaying.set(false);
            this.stopPlaybackLoop();
            return;
          }
        } else if (time >= curSeg.srcEnd - 0.02) {
          // Reached end of current active segment: jump instantly to next segment with ZERO audio bleed!
          const curIndex = segments.findIndex(s => s.id === curSeg.id);
          if (curIndex >= 0 && curIndex < segments.length - 1) {
            const nextSeg = segments[curIndex + 1];
            this.jumpToSegmentStart(video, nextSeg.srcStart);
            return;
          } else {
            video.pause();
            this.isPlaying.set(false);
            this.stopPlaybackLoop();
            return;
          }
        }
      }
    }
  }

  onTimeUpdate(event?: Event): void {
    const video = (event?.target as HTMLVideoElement) || this.videoPlayerRef?.nativeElement;
    if (!video) return;
    this.syncPlayback(video);
  }

  ngOnDestroy(): void {
    this.stopPlaybackLoop();
  }

  seekBy(deltaSeconds: number): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    if (this.aiCutsApplied()) {
      const curVirtual = this.edlService.mapSourceToVirtualTime(video.currentTime);
      const newVirtual = Math.max(0, Math.min(this.newDuration(), curVirtual + deltaSeconds));
      const targetSource = this.edlService.mapVirtualToSourceTime(newVirtual);
      video.currentTime = targetSource;
    } else {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSeconds));
    }
  }

  seekToTime(sourceSeconds: number): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;
    const target = Math.max(0, Math.min(video.duration || 9999, sourceSeconds));
    video.currentTime = target;
    const aiPlayer = this.aiCameraPlayerRef?.nativeElement;
    if (aiPlayer) {
      aiPlayer.currentTime = target;
    }
  }

  setSpeed(speed: number): void {
    this.playbackSpeed.set(speed);
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.playbackRate = speed;
    }
  }

  // Monitor Zoom & Expand
  setVideoZoom(zoom: number): void {
    this.videoZoom.set(zoom);
  }

  toggleMonitorExpand(): void {
    this.isMonitorExpanded.set(!this.isMonitorExpanded());
  }

  setSplitPercent(percent: number): void {
    this.inspectorWidthPercent.set(percent);
  }

  toggleSplitHalf(): void {
    // Toggle between 40% (40/60) and 50% (half and half)
    this.inspectorWidthPercent.set(this.inspectorWidthPercent() === 50 ? 40 : 50);
  }

  startSplitDrag(event: MouseEvent): void {
    event.preventDefault();
    this.isDraggingSplit.set(true);

    const onMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.workspace-top-row') as HTMLElement | null;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const isRtl = document.documentElement.dir === 'rtl' || getComputedStyle(container).direction === 'rtl';
      let inspectorPx: number;
      if (isRtl) {
        inspectorPx = rect.right - e.clientX;
      } else {
        inspectorPx = e.clientX - rect.left;
      }
      const percent = (inspectorPx / rect.width) * 100;
      // Clamp between 25% and 65%
      const clamped = Math.max(25, Math.min(65, Math.round(percent)));
      this.inspectorWidthPercent.set(clamped);
    };

    const onMouseUp = () => {
      this.isDraggingSplit.set(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Toggle dynamic punch-in zoom for a specific segment/phrase
  toggleSegmentZoom(segment: Segment, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const curZoom = segment.zoom || 1.0;
    if (curZoom <= 1.05) {
      segment.zoom = 1.2;
    } else if (curZoom <= 1.25) {
      segment.zoom = 1.35;
    } else {
      segment.zoom = 1.0;
    }

    const edl = this.edl();
    if (edl) {
      this.edl.set({ ...edl });
      this.projectService.saveProject(edl);
    }

    if (this.currentTime() >= segment.srcStart && this.currentTime() <= segment.srcEnd) {
      this.activeSegmentZoom.set(segment.zoom);
    }
  }

  // Timeline Zoom & Scrubbing
  setTimelineZoom(zoom: number): void {
    this.timelineZoom.set(Math.max(0.6, Math.min(4.0, zoom)));
  }

  onTimelineClick(event: MouseEvent): void {
    const track = this.timelineTrackRef?.nativeElement;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    // RTL: 0 is on the right
    const pct = Math.max(0, Math.min(1, 1 - (clickX / rect.width)));

    if (this.aiCutsApplied()) {
      const targetVirtual = pct * this.newDuration();
      const targetSource = this.edlService.mapVirtualToSourceTime(targetVirtual);
      this.seekToTime(targetSource);
    } else {
      const dur = this.originalDuration() || this.videoDuration();
      this.seekToTime(pct * dur);
    }
  }


  // Displayed current time (Virtual time when cuts are applied, or source time when original)
  get displayedCurrentTime(): number {
    if (this.aiCutsApplied()) {
      return this.edlService.mapSourceToVirtualTime(this.currentTime());
    }
    return this.currentTime();
  }

  // Displayed duration (New cut duration when cuts are applied, or original duration when raw)
  get displayedDuration(): number {
    if (this.aiCutsApplied()) {
      return this.newDuration() || this.videoDuration();
    }
    return this.originalDuration() || this.videoDuration();
  }

  // Full media duration: ensures timeline always displays the entire video from start to finish
  get fullMediaDuration(): number {
    return this.originalDuration() || this.videoDuration() || 60;
  }

  // Displayed progress percentage for the timeline and progress bar
  get displayedProgressPercent(): number {
    const total = this.displayedDuration;
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (this.displayedCurrentTime / total) * 100));
  }

  // Group active words into phrases of `wordsPerLine` length for captions
  private updateActiveCaptionPhrase(time: number, activeWord: TranscriptWord | null): void {
    const currentEdl = this.edl();
    if (!currentEdl || !this.showCaptions()) {
      this.currentActivePhrase.set(null);
      return;
    }

    // 1. If cuts are applied, and playback is currently in a cut/silence gap, hide captions!
    if (this.aiCutsApplied()) {
      const seg = this.edlService.getSegmentAtSourceTime(time);
      if (!seg) {
        this.currentActivePhrase.set(null);
        return;
      }
    }

    // 2. If the word at current playback time is removed or silence/filler, DO NOT display captions!
    const wordAtTime = currentEdl.transcript.find(w => time >= w.start && time <= w.end);
    if (wordAtTime && (wordAtTime.removed || wordAtTime.kind !== 'word')) {
      this.currentActivePhrase.set(null);
      return;
    }

    // 3. Only group words that are NOT removed and are real spoken words
    const activeWords = currentEdl.transcript.filter(w => !w.removed && w.kind === 'word');
    if (activeWords.length === 0) {
      this.currentActivePhrase.set(null);
      return;
    }

    const count = this.wordsPerLine();
    let phraseWords: TranscriptWord[] = [];
    let activeWordId: string | null = (activeWord && !activeWord.removed && activeWord.kind === 'word') ? activeWord.id : null;

    if (activeWord && !activeWord.removed && activeWord.kind === 'word') {
      const activeIdx = activeWords.indexOf(activeWord);
      if (activeIdx !== -1) {
        const phraseIndex = Math.floor(activeIdx / count);
        const startIdx = phraseIndex * count;
        phraseWords = activeWords.slice(startIdx, startIdx + count);
      }
    } else {
      // Find chunk that strictly covers current time
      for (let i = 0; i < activeWords.length; i += count) {
        const chunk = activeWords.slice(i, i + count);
        if (chunk.length > 0 && time >= chunk[0].start && time <= chunk[chunk.length - 1].end) {
          phraseWords = chunk;
          break;
        }
      }
    }

    // Strict validation: phrase must exist, only contain active words, and be in active time range
    if (
      phraseWords.length > 0 &&
      phraseWords.every(w => !w.removed && w.kind === 'word') &&
      time >= phraseWords[0].start &&
      time <= phraseWords[phraseWords.length - 1].end + 0.1
    ) {
      this.currentActivePhrase.set({ words: phraseWords, activeWordId });
    } else {
      this.currentActivePhrase.set(null);
    }
  }

  onVideoLoaded(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video) {
      this.videoDuration.set(video.duration || 0);
      if (this.originalDuration() === 0) {
        this.originalDuration.set(video.duration || 0);
        this.newDuration.set(video.duration || 0);
      }
      this.initWebAudioStudio();
    }
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Search Filter
  get filteredTranscript(): TranscriptWord[] {
    const edl = this.edl();
    if (!edl) return [];
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return edl.transcript;
    return edl.transcript.filter(w => w.text.toLowerCase().includes(query));
  }

  // Captions Export
  async generateCaptions(): Promise<void> {
    const edl = this.edl();
    if (!edl) return;

    try {
      const activeWords = edl.transcript.filter(w => !w.removed);
      const captionsPath = await this.ipcService.generateCaptions(
        activeWords,
        this.selectedCaptionStyle()
      );
      alert(`تم توليد وتطبيق ملف التعليقات المتحركة بنجاح:\n${captionsPath}`);
    } catch (error: any) {
      console.error('Caption error:', error);
      alert('حدث خطأ أثناء إنشاء التعليقات');
    }
  }

  // Export
  toggleExportFormat(format: AspectRatio): void {
    const current = [...this.exportFormats()];
    const idx = current.indexOf(format);
    if (idx >= 0) {
      if (current.length > 1) current.splice(idx, 1);
    } else {
      current.push(format);
    }
    this.exportFormats.set(current);
  }

  async exportVideo(): Promise<void> {
    const edl = this.edl();
    if (!edl || !edl.sources || edl.sources.length === 0) {
      alert('يرجى استيراد فيديو أو فتح مشروع أولاً قبل التصدير');
      return;
    }

    // Resolve project export folder (or prompt user if missing)
    let folder = this.projectPath();
    if (!folder) {
      const sourcePath = edl.sources[0]?.path;
      if (sourcePath) {
        const lastSlash = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
        if (lastSlash > 0) {
          folder = sourcePath.substring(0, lastSlash);
          this.projectPath.set(folder);
          await this.ipcService.setProjectPath(folder);
        }
      }
    }

    if (!folder) {
      folder = await this.ipcService.selectFolder();
      if (folder) {
        this.projectPath.set(folder);
        await this.ipcService.setProjectPath(folder);
      } else {
        alert('يرجى تحديد مجلد لحفظ الفيديو المُصدر');
        return;
      }
    }

    this.isExporting.set(true);
    this.exportMessage.set('جاري تحضير المقاطع وتطبيق القصص الذكية...');

    try {
      const format = this.aspectRatio();
      const outputPath = `${folder}/Kemi_${format.replace(':', 'x')}_export.mp4`;
      this.lastExportedPath.set(outputPath);

      const exportEdl = {
        ...edl,
        audioEnhanced: this.audioEnhanced(),
        exportResolution: this.exportResolution(),
        exportQualityPreset: this.exportQualityPreset(),
        enhancePhoneVideo: this.enhancePhoneVideo(),
        phoneOptions: {
          enabled: this.enhancePhoneVideo(),
          sharpening: this.phoneSharpening(),
          denoise: this.phoneDenoise(),
          colorBoost: this.phoneColorBoost()
        },
        captionOptions: {
          enabled: this.showCaptions(),
          style: this.selectedCaptionStyle(),
          fontSize: this.captionFontSize(),
          fontScalePercent: (this.captionFontSize() / 14) * 5.2,
          position: this.captionPosition(),
          wordsPerLine: this.wordsPerLine(),
          previewViewportHeight: this.videoPlayerRef?.nativeElement?.clientHeight || 270
        },
        cinematicOptions: {
          enabled: this.cinematicEnabled(),
          sharpness: this.cinematicSharpness(),
          contrast: this.cinematicContrast(),
          saturation: this.cinematicSaturation(),
          brightness: this.cinematicBrightness(),
          temperature: this.cinematicTemperature()
        }
      };

      await this.ipcService.exportVideo(exportEdl, outputPath, format);
      this.exportSuccessDialog.set(true);
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(`حدث خطأ أثناء التصدير: ${error.message || error}`);
    } finally {
      this.isExporting.set(false);
    }
  }

  async batchExport(): Promise<void> {
    const edl = this.edl();
    if (!edl || !edl.sources || edl.sources.length === 0) {
      alert('يرجى استيراد فيديو أو فتح مشروع أولاً قبل التصدير');
      return;
    }

    let folder = this.projectPath();
    if (!folder) {
      const sourcePath = edl.sources[0]?.path;
      if (sourcePath) {
        const lastSlash = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
        if (lastSlash > 0) {
          folder = sourcePath.substring(0, lastSlash);
          this.projectPath.set(folder);
          await this.ipcService.setProjectPath(folder);
        }
      }
    }

    if (!folder) {
      folder = await this.ipcService.selectFolder();
      if (folder) {
        this.projectPath.set(folder);
        await this.ipcService.setProjectPath(folder);
      } else {
        alert('يرجى تحديد مجلد لحفظ الفيديوهات');
        return;
      }
    }

    this.isExporting.set(true);
    this.exportMessage.set('جاري تصدير جميع المقاسات (9:16, 16:9, 1:1)...');

    try {
      this.lastExportedPath.set(folder);
      const exportEdl = {
        ...edl,
        audioEnhanced: this.audioEnhanced(),
        exportResolution: this.exportResolution(),
        exportQualityPreset: this.exportQualityPreset(),
        enhancePhoneVideo: this.enhancePhoneVideo(),
        phoneOptions: {
          enabled: this.enhancePhoneVideo(),
          sharpening: this.phoneSharpening(),
          denoise: this.phoneDenoise(),
          colorBoost: this.phoneColorBoost()
        },
        captionOptions: {
          enabled: this.showCaptions(),
          style: this.selectedCaptionStyle(),
          fontSize: this.captionFontSize(),
          fontScalePercent: (this.captionFontSize() / 14) * 5.2,
          position: this.captionPosition(),
          wordsPerLine: this.wordsPerLine(),
          previewViewportHeight: this.videoPlayerRef?.nativeElement?.clientHeight || 270
        },
        cinematicOptions: {
          enabled: this.cinematicEnabled(),
          sharpness: this.cinematicSharpness(),
          contrast: this.cinematicContrast(),
          saturation: this.cinematicSaturation(),
          brightness: this.cinematicBrightness(),
          temperature: this.cinematicTemperature()
        }
      };
      await this.ipcService.batchExport(exportEdl, this.exportFormats());
      this.exportSuccessDialog.set(true);
    } catch (error: any) {
      console.error('Batch export error:', error);
      alert(`فشل التصدير المتعدد: ${error.message || error}`);
    } finally {
      this.isExporting.set(false);
    }
  }

  async openExportFolder(): Promise<void> {
    const folder = this.projectPath();
    if (folder) {
      await this.ipcService.openFolder(folder);
    }
  }

  async extractReels(): Promise<void> {
    const edl = this.edl();
    if (!edl) return;

    try {
      const reels = await this.ipcService.extractReels(edl.transcript, 15, 60);
      alert(`تم استخراج ${reels.length} مقطع ريلز واعد من الفيديو بنجاح!`);
    } catch (error: any) {
      console.error('Reels extract error:', error);
      alert('حدث خطأ أثناء استخراج الريلز');
    }
  }

  cancelExport(): void {
    this.isExporting.set(false);
  }

  onCaptionWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const step = event.deltaY < 0 ? 1 : -1;
    this.changeCaptionFontSize(step);
  }

  changeCaptionFontSize(delta: number, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const current = this.captionFontSize();
    const updated = Math.max(8, Math.min(48, current + delta));
    this.captionFontSize.set(updated);

    this.showCaptionSizeBadge.set(true);
    if (this.captionBadgeTimeout) {
      clearTimeout(this.captionBadgeTimeout);
    }
    this.captionBadgeTimeout = setTimeout(() => {
      this.showCaptionSizeBadge.set(false);
    }, 1200);
  }
}
