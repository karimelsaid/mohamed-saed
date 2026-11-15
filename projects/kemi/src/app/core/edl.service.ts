import { Injectable } from '@angular/core';
import { EDL, TranscriptWord, Segment, RemoveReason, VirtualCamera } from './types';

@Injectable({ providedIn: 'root' })
export class EdlService {
  private edl: EDL | null = null;
  public minSilenceLength = 0.55; // seconds - natural threshold preserving natural speech cadence
  public paddingSec = 0.12;      // 120ms natural acoustic padding to prevent consonant cutoffs
  public enableAlternatingZoom = true; // §6.3: 100% / 118% zoom to hide jump cuts

  createEdl(): EDL {
    this.edl = {
      version: 1,
      sources: [],
      transcript: [],
      segments: [],
      virtualCameras: [
        { id: 'cam1', name: 'زاوية واسعة (مباشرة)', zoom: 1.0, panX: 0, panY: 0, rotateY: 0, rotateX: 0 },
        { id: 'cam2', name: 'زاوية يمين سينمائية (3D)', zoom: 1.15, panX: -4, panY: 0, rotateY: 5.5, rotateX: 0 },
        { id: 'cam3', name: 'زاوية يسار سينمائية (3D)', zoom: 1.15, panX: 4, panY: 0, rotateY: -5.5, rotateX: 0 },
        { id: 'cam4', name: 'لقطة مقربة (3D Focus)', zoom: 1.25, panX: 0, panY: -2, rotateY: 0, rotateX: 1.5 },
      ],
      captions: {
        template: 'knooz-default',
        enabled: true,
        wordsPerLine: 3,
        position: 'bottom',
        fontSize: 32
      },
      export: { formats: ['16:9'] }
    };
    return this.edl;
  }

  getEdl(): EDL | null {
    return this.edl;
  }

  setEdl(edl: EDL): void {
    this.edl = edl;
  }

  updateWordRemoval(wordId: string, removed: boolean, reason: RemoveReason | null): void {
    if (!this.edl) return;
    const word = this.edl.transcript.find(w => w.id === wordId);
    if (word) {
      word.removed = removed;
      word.removeReason = removed ? (reason || (word.kind === 'silence' ? 'silence' : 'manual')) : null;
      this.computeSegments();
    }
  }

  updateWordText(wordId: string, newText: string): void {
    if (!this.edl) return;
    const word = this.edl.transcript.find(w => w.id === wordId);
    if (word && newText.trim()) {
      word.text = newText.trim();
    }
  }

  toggleWord(wordId: string): boolean {
    if (!this.edl) return false;
    const word = this.edl.transcript.find(w => w.id === wordId);
    if (word) {
      word.removed = !word.removed;
      word.removeReason = word.removed ? (word.kind === 'silence' ? 'silence' : 'manual') : null;
      this.computeSegments();
      return word.removed;
    }
    return false;
  }

  restoreAll(): void {
    if (!this.edl) return;
    for (const w of this.edl.transcript) {
      w.removed = false;
      w.removeReason = null;
    }
    this.computeSegments();
  }

  // =====================================================================
  // SILENCE INSERTION & MANAGEMENT ENGINE
  // =====================================================================

  buildTranscriptWithSilences(spokenWords: TranscriptWord[], minSilenceSec: number = 0.4): TranscriptWord[] {
    if (!spokenWords || spokenWords.length === 0) return [];

    // Filter to purely spoken words and sort
    const cleanWords = spokenWords.filter(w => w.kind !== 'silence').sort((a, b) => a.start - b.start);
    if (cleanWords.length === 0) return [];

    const result: TranscriptWord[] = [];
    let silCounter = 0;

    // 1. Check for silence before first spoken word
    if (cleanWords[0].start >= minSilenceSec) {
      const silEnd = Number(cleanWords[0].start.toFixed(3));
      result.push({
        id: `sil_start`,
        text: `وقفة ${silEnd.toFixed(1)}ث`,
        start: 0,
        end: silEnd,
        kind: 'silence',
        removed: false,
        removeReason: null
      });
    }

    for (let i = 0; i < cleanWords.length; i++) {
      const cur = cleanWords[i];
      result.push(cur);

      if (i < cleanWords.length - 1) {
        const next = cleanWords[i + 1];
        const gap = Number((next.start - cur.end).toFixed(3));
        if (gap >= minSilenceSec) {
          result.push({
            id: `sil_${silCounter++}`,
            text: `وقفة ${gap.toFixed(1)}ث`,
            start: Number(cur.end.toFixed(3)),
            end: Number(next.start.toFixed(3)),
            kind: 'silence',
            removed: false,
            removeReason: null
          });
        }
      }
    }

    return result;
  }

  insertSilences(minSilenceSec?: number): void {
    if (!this.edl || !this.edl.transcript || this.edl.transcript.length === 0) return;
    const threshold = minSilenceSec !== undefined ? minSilenceSec : this.minSilenceLength;
    this.minSilenceLength = threshold;

    // Map existing silences by time window to retain manual user choice (cut or kept)
    const existingStatus = new Map<string, { removed: boolean; removeReason: RemoveReason | null }>();
    for (const w of this.edl.transcript) {
      if (w.kind === 'silence') {
        const key = `${w.start.toFixed(2)}_${w.end.toFixed(2)}`;
        existingStatus.set(key, { removed: w.removed, removeReason: w.removeReason });
      }
    }

    const spokenWords = this.edl.transcript.filter(w => w.kind !== 'silence');
    const newTranscript = this.buildTranscriptWithSilences(spokenWords, threshold);

    // Reapply previously saved states for existing matching silences
    for (const w of newTranscript) {
      if (w.kind === 'silence') {
        const key = `${w.start.toFixed(2)}_${w.end.toFixed(2)}`;
        const prev = existingStatus.get(key);
        if (prev) {
          w.removed = prev.removed;
          w.removeReason = prev.removeReason;
        }
      }
    }

    this.edl.transcript = newTranscript;
    this.computeSegments();
  }

  setAllSilencesRemoved(removed: boolean): void {
    if (!this.edl || !this.edl.transcript) return;
    for (const w of this.edl.transcript) {
      if (w.kind === 'silence') {
        w.removed = removed;
        w.removeReason = removed ? 'silence' : null;
      }
    }
    this.computeSegments();
  }

  removeLongSilences(thresholdSec: number = 0.8): void {
    if (!this.edl || !this.edl.transcript) return;
    for (const w of this.edl.transcript) {
      if (w.kind === 'silence') {
        const dur = w.end - w.start;
        if (dur >= thresholdSec) {
          w.removed = true;
          w.removeReason = 'silence';
        } else {
          w.removed = false;
          w.removeReason = null;
        }
      }
    }
    this.computeSegments();
  }

  getSilenceStats(): { total: number; removed: number; kept: number; totalSec: number; savedSec: number } {
    if (!this.edl || !this.edl.transcript) {
      return { total: 0, removed: 0, kept: 0, totalSec: 0, savedSec: 0 };
    }
    const silences = this.edl.transcript.filter(w => w.kind === 'silence');
    const removed = silences.filter(w => w.removed);
    const totalSec = silences.reduce((acc, w) => acc + (w.end - w.start), 0);
    const savedSec = removed.reduce((acc, w) => acc + (w.end - w.start), 0);
    return {
      total: silences.length,
      removed: removed.length,
      kept: silences.length - removed.length,
      totalSec: Number(totalSec.toFixed(2)),
      savedSec: Number(savedSec.toFixed(2))
    };
  }

  // =====================================================================
  // SMART FILLER, STUTTERING & RETAKE DETECTION ENGINE (ARABIC-AWARE)
  // Flexible, context-aware, normalized root comparison
  // =====================================================================

  public normalizeArabic(text: string): string {
    if (!text) return '';
    return text.trim().toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // remove diacritics
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[.,!؟،_ـ-]/g, '');
  }

  public stripDefiniteArticle(text: string): string {
    const norm = this.normalizeArabic(text);
    return (norm.startsWith('ال') && norm.length > 3) ? norm.substring(2) : norm;
  }

  // Pattern 1: Elongated Arabic hesitation sounds
  private isElongatedSound(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    // اييييي, اااااه, امممم, آآآآ, هممم, إمم (requires at least 2 repeats so "أو" / "أي" are NEVER matched)
    if (/^[اآإأ](?:ي{2,}|ا{2,}|م{2,}|ه{2,}|و{2,})[هة]?$/u.test(t)) return true;
    // Single repeated char: ااا, ممم, ييي
    if (t.length >= 2 && new Set(t.split('')).size === 1) return true;
    // هممم, إمم, همم
    if (/^[هإ]م{2,}$/u.test(t)) return true;
    // آهه, اهه, إهه (repeated sigh)
    if (/^[اآإأ]ه{2,}$/u.test(t)) return true;
    return false;
  }

  // Pattern 2: Known common Arabic fillers
  private isKnownFiller(text: string): boolean {
    const norm = this.normalizeArabic(text);
    if (!norm) return false;

    const fillers = new Set([
      'اه', 'آه', 'اهم', 'امم', 'هم', 'همم', 'همى', 'آ', 'اا', 'ااا', 'إإإ', 'أأأ',
      'اييه', 'اييي', 'احم', 'اوه', 'آوه'
    ]);
    if (fillers.has(norm)) return true;

    // Fuzzy: if the core of the word matches after stripping elongation
    const deflated = norm.replace(/(.)\1{1,}/g, '$1');
    if (fillers.has(deflated)) return true;

    return false;
  }

  // Common Arabic functional words: NEVER treat these as stutters or fragments
  private static readonly PROTECTED_WORDS = new Set([
    // Prepositions
    'من', 'في', 'عن', 'على', 'الى', 'مع', 'بين', 'حتى', 'عند', 'لدى', 'بعد', 'قبل', 'فوق', 'تحت',
    // Pronouns & demonstratives
    'هو', 'هي', 'هم', 'هن', 'انا', 'انت', 'انتي', 'احنا', 'هما',
    'ده', 'دي', 'دا', 'دول', 'هذا', 'هذه', 'هذي', 'ذلك', 'تلك', 'هنا', 'كده',
    // Particles & conjunctions
    'ان', 'لو', 'لا', 'ما', 'يا', 'او', 'بس', 'كل', 'قد', 'مش', 'كان', 'هل', 'لم', 'لن',
    'ثم', 'لكن', 'بل', 'اللي', 'زي', 'غير',
    // Common short verbs/words
    'خد', 'حط', 'شف', 'قل', 'جه', 'جت', 'طب', 'اي', 'نعم', 'بتاع', 'حق', 'مال',
  ]);

  // Pattern 3: Detect word-level stuttering & false start fragments
  private isStutter(prev: TranscriptWord, current: TranscriptWord): boolean {
    const prevNorm = this.normalizeArabic(prev.text);
    const curNorm = this.normalizeArabic(current.text);
    if (!prevNorm || !curNorm) return false;

    // CRITICAL: Never treat common Arabic functional words as stutters
    if (EdlService.PROTECTED_WORDS.has(prevNorm)) {
      return false;
    }

    // Broken word ending in hyphen or dash (e.g. "ال-", "سوـ", "الحـ") - always a stutter
    if (/^[^\s]+[-ـ]$/u.test(prev.text.trim()) || /^[^\s]+[-ـ]$/u.test(current.text.trim())) {
      return true;
    }

    // Single letter consonant stutter (e.g. "م", "س", "ب", "ف") but not "و" (conjunction)
    if (prevNorm.length === 1 && !['و', 'ف', 'ب'].includes(prevNorm)) {
      return true;
    }

    // Previous word is fragment and current word starts with it
    if (prevNorm.length >= 1
        && curNorm.length > prevNorm.length
        && curNorm.startsWith(prevNorm)
        && (current.start - prev.end) < 1.8) {
      return true;
    }

    // Low confidence stumbles
    const prevConf = (prev as any).confidence ?? (prev as any).probability ?? 1.0;
    if (prevConf < 0.25 && prevNorm.length <= 4 && (current.start - prev.end) < 1.2) {
      return true;
    }

    return false;
  }

  // Pattern 4: Safe phrase-level retake detection (requires at least 3 matching content words within < 3.5s, excluding common recurrent formulas)
  private detectPhraseRetakes(): number {
    if (!this.edl) return 0;
    const words = this.edl.transcript;
    let removedCount = 0;

    // Common Arabic formulas & sales anchors that are repeated naturally across normal speech
    const recurrentFormulas = new Set([
      'مشاء', 'ماشاء', 'الله', 'معنا', 'اللون', 'لون', 'الحمد', 'لله',
      'صلوا', 'على', 'النبي', 'فرع', 'فراء', 'مدينة', 'نصر', 'الرياض'
    ]);

    for (let i = 0; i < words.length - 3; i++) {
      if (words[i].removed) continue;
      const w1 = this.stripDefiniteArticle(words[i].text);
      if (!w1 || w1.length < 2 || recurrentFormulas.has(w1)) continue;

      // An abandoned take restart occurs immediately (< 3.5s gap, not distant sentences)
      for (let j = i + 2; j < Math.min(i + 10, words.length); j++) {
        if (words[j].removed) continue;
        if (words[j].start - words[i].end > 3.5) break;

        const w2 = this.stripDefiniteArticle(words[j].text);
        if (w1 === w2) {
          let matchCount = 1;
          let k = 1;
          while ((i + k) < j && (j + k) < words.length && k < 6) {
            const m1 = this.stripDefiniteArticle(words[i + k].text);
            const m2 = this.stripDefiniteArticle(words[j + k].text);
            if (m1 && m2 && m1 === m2) {
              matchCount++;
              k++;
            } else {
              break;
            }
          }

          if (matchCount >= 4) {
            for (let m = i; m < (i + k); m++) {
              if (!words[m].removed) {
                words[m].removed = true;
                words[m].removeReason = 'retake';
                removedCount++;
              }
            }
            break;
          }
        }
      }
    }
    return removedCount;
  }

  // Pattern 5: Detect very short "noise" words with low confidence
  private isLikelyNoise(word: TranscriptWord): boolean {
    const confidence = (word as any).confidence;
    const duration = word.end - word.start;
    const text = word.text.trim();

    if (confidence !== undefined && confidence < 0.25 && duration < 0.15) return true;
    if (text.length === 1 && confidence !== undefined && confidence < 0.4) return true;
    return false;
  }

  // ===== MAIN AI CUTS ENGINE =====
  applyAiCuts(fillerWords: string[]): { removedWordsCount: number; savedSec: number } {
    if (!this.edl) return { removedWordsCount: 0, savedSec: 0 };

    const userFillers = new Set(fillerWords.map(w => this.normalizeArabic(w)));
    let removedWordsCount = 0;

    // === PASS 0: Cut all detected silences ===
    for (let i = 0; i < this.edl.transcript.length; i++) {
      const word = this.edl.transcript[i];
      if (word.kind === 'silence' && !word.removed) {
        word.removed = true;
        word.removeReason = 'silence';
        removedWordsCount++;
      }
    }

    // === PASS 1: Direct Detection (fillers, elongated sounds, noise) ===
    for (let i = 0; i < this.edl.transcript.length; i++) {
      const word = this.edl.transcript[i];
      if (word.removed) continue;
      const wordText = word.text.trim();
      const norm = this.normalizeArabic(wordText);
      const deflated = norm.replace(/(.)\1{1,}/g, '$1');

      // 1a. Already flagged as filler by Whisper engine
      if ((word as any).kind === 'filler') {
        word.removed = true;
        word.removeReason = 'filler';
        removedWordsCount++;
        continue;
      }

      // 1b. User custom filler list
      if (userFillers.has(norm) || userFillers.has(deflated)) {
        word.removed = true;
        word.removeReason = 'filler';
        removedWordsCount++;
        continue;
      }

      // 1c. Elongated hesitation sounds
      if (this.isElongatedSound(wordText)) {
        word.removed = true;
        word.removeReason = 'filler';
        removedWordsCount++;
        continue;
      }

      // 1d. Known Arabic fillers (with context check for ambiguous words)
      if (this.isKnownFiller(wordText)) {
        if (norm === 'لا' || norm === 'طيب' || norm === 'اهنا') {
          const prevGap = i > 0 ? (word.start - this.edl.transcript[i - 1].end) : 1;
          const nextGap = i < this.edl.transcript.length - 1 ? (this.edl.transcript[i + 1].start - word.end) : 1;
          if (prevGap > 0.18 || nextGap > 0.18 || (i > 0 && this.edl.transcript[i - 1].removed)) {
            word.removed = true;
            word.removeReason = 'filler';
            removedWordsCount++;
            continue;
          }
        } else {
          word.removed = true;
          word.removeReason = 'filler';
          removedWordsCount++;
          continue;
        }
      }

      // 1e. Likely mouth noise
      if (this.isLikelyNoise(word)) {
        word.removed = true;
        word.removeReason = 'filler';
        removedWordsCount++;
        continue;
      }
    }

    // === PASS 2: Multi-word False Starts & Repetitions (e.g. "الكتاب ... ااا ... الكتاب") ===
    for (let i = 0; i < this.edl.transcript.length - 1; i++) {
      if (this.edl.transcript[i].removed) continue;
      const w1 = this.stripDefiniteArticle(this.edl.transcript[i].text);
      if (!w1 || w1.length < 3) continue;  // Require at least 3 chars to avoid false matches

      // Skip protected functional words - they naturally repeat
      if (EdlService.PROTECTED_WORDS.has(this.normalizeArabic(this.edl.transcript[i].text))) continue;

      // Look for same word within 1 to 3 words
      for (let j = i + 1; j <= Math.min(i + 3, this.edl.transcript.length - 1); j++) {
        const targetWord = this.edl.transcript[j];
        if (targetWord.start - this.edl.transcript[i].end > 2.0) break;

        const w2 = this.stripDefiniteArticle(targetWord.text);
        if (w1 === w2) {
          // SAFEGUARD: Only consider it a false-start stutter restart if words between them
          // are ONLY fillers or hesitations (never delete legitimate sentences/phrases!)
          const wordsBetween = this.edl.transcript.slice(i + 1, j);
          const allBetweenAreFillers = wordsBetween.every(bw =>
            bw.removed ||
            (bw as any).kind === 'filler' ||
            this.isKnownFiller(bw.text) ||
            this.isElongatedSound(bw.text)
          );

          if (allBetweenAreFillers) {
            this.edl.transcript[i].removed = true;
            this.edl.transcript[i].removeReason = 'stutter';
            removedWordsCount++;

            for (let k = i + 1; k < j; k++) {
              if (!this.edl.transcript[k].removed) {
                this.edl.transcript[k].removed = true;
                this.edl.transcript[k].removeReason = 'filler';
                removedWordsCount++;
              }
            }
            break;
          }
        }
      }
    }

    // === PASS 3: Adjacent Word-level Stutters & Syllables ===
    for (let i = 1; i < this.edl.transcript.length; i++) {
      const word = this.edl.transcript[i];
      const prev = this.edl.transcript[i - 1];
      if (word.removed && prev.removed) continue;

      if (!prev.removed && !word.removed && this.isStutter(prev, word)) {
        prev.removed = true;
        prev.removeReason = 'stutter';
        removedWordsCount++;
      }
    }

    // === PASS 4: Phrase Retake Detection ===
    removedWordsCount += this.detectPhraseRetakes();

    // === PASS 5: Orphan Echo Words Between Silences ===
    // VERY conservative: only remove truly isolated echo fragments
    // that appeared in the immediately preceding 4 words AND are very short AND have big gaps on both sides
    for (let i = 1; i < this.edl.transcript.length - 1; i++) {
      const w = this.edl.transcript[i];
      if (w.removed) continue;
      const norm = this.normalizeArabic(w.text);

      // Never remove protected functional words as orphan echoes
      if (EdlService.PROTECTED_WORDS.has(norm)) continue;

      const prev = this.edl.transcript[i - 1];
      const next = this.edl.transcript[i + 1];
      const prevGap = w.start - prev.end;
      const nextGap = next.start - w.end;
      const wordDur = w.end - w.start;

      // Require very strong isolation: big gaps on both sides, very short word
      if (prevGap >= 0.5 && nextGap >= 1.0 && wordDur < 0.5) {
        const normStripped = this.stripDefiniteArticle(w.text);
        // Only check the immediately preceding 4 words (not 15)
        const appearedEarlier = this.edl.transcript
          .slice(Math.max(0, i - 4), i)
          .some(x => !x.removed && this.stripDefiniteArticle(x.text) === normStripped);
        if (appearedEarlier) {
          w.removed = true;
          w.removeReason = 'stutter';
          removedWordsCount++;
        }
      }
    }

    this.computeSegments();
    return {
      removedWordsCount,
      savedSec: this.getTimeSaved()
    };
  }

  computeSegments(): Segment[] {
    if (!this.edl) return [];

    const hasAnyRemoved = this.hasAppliedCuts();
    if (!hasAnyRemoved) {
      if (this.edl.sources.length > 0) {
        const origDur = this.getOriginalDuration() || 9999;
        const vCams = this.getVirtualCameras();
        const firstCam = vCams[0]?.id || 'cam1';

        // If we only have 1 single segment, split it by interval if multiple cameras exist
        if (vCams.length > 1 && origDur > 8) {
          const segs: Segment[] = [];
          const switchInterval = 5; // 5 seconds per angle
          let curStart = 0;
          let camIdx = 0;
          while (curStart < origDur) {
            const curEnd = Math.min(origDur, curStart + switchInterval);
            const cam = vCams[camIdx % vCams.length];
            segs.push({
              id: `s${segs.length + 1}`,
              camera: cam.id,
              srcStart: Number(curStart.toFixed(3)),
              srcEnd: Number(curEnd.toFixed(3)),
              zoom: cam.zoom
            });
            curStart = curEnd;
            camIdx++;
          }
          this.edl.segments = segs;
          return this.edl.segments;
        }

        this.edl.segments = [{
          id: 's1',
          camera: firstCam,
          srcStart: 0,
          srcEnd: origDur,
          zoom: 1.0
        }];
        return this.edl.segments;
      }
      this.edl.segments = [];
      return [];
    }

    const activeWords = this.edl.transcript.filter(w => !w.removed);
    if (activeWords.length === 0) {
      this.edl.segments = [];
      return [];
    }

    const segments: Segment[] = [];
    const vCams = this.getVirtualCameras();
    const cam1 = vCams[0] || { id: 'cam1', name: 'زاوية واسعة', zoom: 1.0, panX: 0, panY: 0 };
    const cam2 = vCams[1] || { id: 'cam2', name: 'لقطة مقربة', zoom: 1.18, panX: 0, panY: 0 };
    let currentCam = cam1;

    const firstActive = activeWords[0];
    const firstIdx = this.edl.transcript.indexOf(firstActive);
    // Never clip the start of the video if the first word is active
    let segmentStart = 0;
    if (firstIdx > 0) {
      const lastRemovedBefore = this.edl.transcript[firstIdx - 1];
      segmentStart = Math.max(lastRemovedBefore.end, firstActive.start - 0.08);
    }
    let segmentEnd = firstActive.end + 0.15;

    for (let i = 0; i < activeWords.length - 1; i++) {
      const currentWord = activeWords[i];
      const nextWord = activeWords[i + 1];

      const gap = nextWord.start - currentWord.end;
      const currIdx = this.edl.transcript.indexOf(currentWord);
      const nextIdx = this.edl.transcript.indexOf(nextWord);
      const isWordSkipped = (nextIdx - currIdx) > 1;

      // Cut ONLY if words between them were explicitly removed!
      // Never cut video or natural pauses between unremoved words!
      if (isWordSkipped && currIdx !== -1 && nextIdx !== -1) {
        const removedWordsBetween = this.edl.transcript.slice(currIdx + 1, nextIdx);
        const removedSpanStart = removedWordsBetween[0]?.start ?? currentWord.end;
        const removedSpanEnd = removedWordsBetween[removedWordsBetween.length - 1]?.end ?? nextWord.start;

        // Safe boundary: keep current word intact up to the removed span, never clip syllables
        segmentEnd = Math.min(currentWord.end + 0.08, removedSpanStart);

        segments.push({
          id: `s${segments.length + 1}`,
          camera: currentCam.id,
          srcStart: Number(segmentStart.toFixed(3)),
          srcEnd: Number(segmentEnd.toFixed(3)),
          zoom: currentCam.zoom
        });

        if (this.enableAlternatingZoom) {
          currentCam = currentCam.id === cam1.id ? cam2 : cam1;
        }

        // Next segment starts cleanly after the removed span with safe padding before next word
        segmentStart = Math.max(removedSpanEnd, nextWord.start - 0.08);
      } else {
        // Continuous natural speech and pauses: keep consecutive unremoved words in the same segment!
        segmentEnd = nextWord.end + 0.15;
      }
    }

    const lastWord = activeWords[activeWords.length - 1];
    const lastIdx = this.edl.transcript.indexOf(lastWord);
    // Never cut off the end of the video if the last word is active
    let finalSegmentEnd = this.getOriginalDuration() || (lastWord.end + 1.0);
    if (lastIdx !== -1 && lastIdx < this.edl.transcript.length - 1) {
      const firstRemovedAfter = this.edl.transcript[lastIdx + 1];
      finalSegmentEnd = Math.min(lastWord.end + 0.08, firstRemovedAfter.start);
    }

    segments.push({
      id: `s${segments.length + 1}`,
      camera: currentCam.id,
      srcStart: Number(segmentStart.toFixed(3)),
      srcEnd: Number(finalSegmentEnd.toFixed(3)),
      zoom: currentCam.zoom
    });

    this.edl.segments = segments;
    return segments;
  }

  // Find active segment containing the source timestamp
  getSegmentAtSourceTime(sourceTime: number): Segment | undefined {
    if (!this.edl || this.edl.segments.length === 0) return undefined;
    return this.edl.segments.find(s => sourceTime >= s.srcStart && sourceTime < s.srcEnd);
  }

  // Find next segment starting after sourceTime
  getNextSegment(sourceTime: number): Segment | undefined {
    if (!this.edl || this.edl.segments.length === 0) return undefined;
    return this.edl.segments.find(s => s.srcStart > sourceTime);
  }

  // Map source video seconds to virtual filtered duration seconds
  mapSourceToVirtualTime(sourceTime: number): number {
    if (!this.edl || this.edl.segments.length === 0) return sourceTime;

    let accumulated = 0;
    for (const seg of this.edl.segments) {
      if (sourceTime >= seg.srcEnd) {
        accumulated += (seg.srcEnd - seg.srcStart);
      } else if (sourceTime >= seg.srcStart && sourceTime < seg.srcEnd) {
        accumulated += (sourceTime - seg.srcStart);
        return Number(accumulated.toFixed(3));
      } else if (sourceTime < seg.srcStart) {
        return Number(accumulated.toFixed(3));
      }
    }
    return Number(accumulated.toFixed(3));
  }

  // Map virtual filtered seconds to source video second
  mapVirtualToSourceTime(virtualTime: number): number {
    if (!this.edl || this.edl.segments.length === 0) return virtualTime;

    let accumulated = 0;
    for (const seg of this.edl.segments) {
      const segDur = seg.srcEnd - seg.srcStart;
      if (virtualTime <= accumulated + segDur) {
        const offsetInSeg = Math.max(0, virtualTime - accumulated);
        return Number((seg.srcStart + offsetInSeg).toFixed(3));
      }
      accumulated += segDur;
    }

    const lastSeg = this.edl.segments[this.edl.segments.length - 1];
    return lastSeg ? lastSeg.srcEnd : virtualTime;
  }

  getOriginalDuration(): number {
    if (!this.edl || this.edl.transcript.length === 0) return 0;
    const lastWord = this.edl.transcript[this.edl.transcript.length - 1];
    return Number((lastWord.end + 0.5).toFixed(2));
  }

  getTotalDuration(): number {
    if (!this.edl) return 0;
    const segments = this.edl.segments.length > 0 ? this.edl.segments : this.computeSegments();
    const dur = segments.reduce((acc, seg) => acc + (seg.srcEnd - seg.srcStart), 0);
    return Number(dur.toFixed(2));
  }

  getTimeSaved(): number {
    const orig = this.getOriginalDuration();
    const current = this.getTotalDuration();
    return Math.max(0, Number((orig - current).toFixed(2)));
  }

  getTimeSavedPercentage(): number {
    const orig = this.getOriginalDuration();
    if (orig <= 0) return 0;
    return Math.round((this.getTimeSaved() / orig) * 100);
  }

  hasAppliedCuts(): boolean {
    if (!this.edl) return false;
    return this.edl.transcript.some(w => w.removed);
  }

  // =====================================================================
  // VIRTUAL MULTI-CAMERA ENGINE (Single Video Multi-Angle)
  // =====================================================================

  /** Get all registered virtual camera angles (initializes defaults if missing) */
  getVirtualCameras(): VirtualCamera[] {
    if (!this.edl) return [];
    if (!this.edl.virtualCameras || this.edl.virtualCameras.length === 0) {
      this.edl.virtualCameras = [
        { id: 'cam1', name: 'زاوية واسعة (مباشرة)', zoom: 1.0, panX: 0, panY: 0, rotateY: 0, rotateX: 0 },
        { id: 'cam2', name: 'زاوية يمين سينمائية (3D)', zoom: 1.15, panX: -4, panY: 0, rotateY: 5.5, rotateX: 0 },
        { id: 'cam3', name: 'زاوية يسار سينمائية (3D)', zoom: 1.15, panX: 4, panY: 0, rotateY: -5.5, rotateX: 0 },
        { id: 'cam4', name: 'لقطة مقربة (3D Focus)', zoom: 1.25, panX: 0, panY: -2, rotateY: 0, rotateX: 1.5 },
      ];
    }
    return this.edl.virtualCameras;
  }

  /** Find a virtual camera by its id */
  getVirtualCameraById(id: string): VirtualCamera | undefined {
    return this.getVirtualCameras().find(c => c.id === id);
  }

  /** Add a new virtual camera angle */
  addVirtualCamera(name?: string, zoom: number = 1.18, panX: number = 0, panY: number = 0, rotateY: number = 0, rotateX: number = 0): VirtualCamera {
    const list = this.getVirtualCameras();
    const newId = `cam${list.length + 1}`;
    const newCam: VirtualCamera = {
      id: newId,
      name: name || `زاوية 3D مخصصة ${list.length + 1}`,
      zoom: Number(zoom.toFixed(2)),
      panX,
      panY,
      rotateY,
      rotateX
    };
    list.push(newCam);
    return newCam;
  }

  /** Remove a virtual camera (cannot remove cam1) */
  removeVirtualCamera(id: string): void {
    if (id === 'cam1') return; // Protect main camera
    const list = this.getVirtualCameras();
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      // Reassign any segment referencing removed camera back to cam1
      if (this.edl) {
        for (const seg of this.edl.segments) {
          if (seg.camera === id) {
            seg.camera = 'cam1';
            seg.zoom = list[0]?.zoom || 1.0;
          }
        }
      }
    }
  }

  /** Update virtual camera settings (zoom, pan, name) */
  updateVirtualCamera(id: string, updates: Partial<VirtualCamera>): void {
    const cam = this.getVirtualCameraById(id);
    if (cam) {
      Object.assign(cam, updates);
      // Update zoom on existing segments assigned to this camera
      if (this.edl && updates.zoom !== undefined) {
        for (const seg of this.edl.segments) {
          if (seg.camera === id) {
            seg.zoom = updates.zoom;
          }
        }
      }
    }
  }

  /** Assign a specific virtual camera to a segment */
  assignCameraToSegment(segmentId: string, cameraId: string): void {
    if (!this.edl) return;
    const seg = this.edl.segments.find(s => s.id === segmentId);
    const cam = this.getVirtualCameraById(cameraId);
    if (seg && cam) {
      seg.camera = cam.id;
      seg.zoom = cam.zoom;
    }
  }

  /** Auto-distribute virtual cameras across segments */
  autoAssignCameras(intervalSec: number = 5, pattern: 'alternate-cuts' | 'sequential' | 'random' | 'smart' = 'alternate-cuts'): void {
    if (!this.edl || this.edl.segments.length === 0) return;
    const cameras = this.getVirtualCameras();
    if (cameras.length === 0) return;

    const segments = this.edl.segments;
    const cam1 = cameras[0];
    const cam2 = cameras[1] || cam1;

    if (pattern === 'alternate-cuts') {
      // Alternate between wide and close-up at each cut
      let currentCam = cam1;
      for (const seg of segments) {
        seg.camera = currentCam.id;
        seg.zoom = currentCam.zoom;
        currentCam = currentCam.id === cam1.id ? cam2 : cam1;
      }
      return;
    }

    if (pattern === 'random') {
      let lastCamId = '';
      for (const seg of segments) {
        let chosen: VirtualCamera;
        do {
          chosen = cameras[Math.floor(Math.random() * cameras.length)];
        } while (chosen.id === lastCamId && cameras.length > 1);
        seg.camera = chosen.id;
        seg.zoom = chosen.zoom;
        lastCamId = chosen.id;
      }
      return;
    }

    // Sequential & Smart
    let accumulatedTime = 0;
    let currentCamIdx = 0;
    let lastSwitchTime = 0;

    for (const seg of segments) {
      const segDuration = seg.srcEnd - seg.srcStart;

      if (pattern === 'smart') {
        if (accumulatedTime - lastSwitchTime >= intervalSec) {
          currentCamIdx = (currentCamIdx + 1) % cameras.length;
          lastSwitchTime = accumulatedTime;
        }
      } else {
        const intervalIndex = Math.floor(accumulatedTime / intervalSec);
        currentCamIdx = intervalIndex % cameras.length;
      }

      const cam = cameras[currentCamIdx];
      seg.camera = cam.id;
      seg.zoom = cam.zoom;
      accumulatedTime += segDuration;
    }
  }

  /** Reset all segments to the main wide camera (cam1) */
  resetCameraAssignments(): void {
    if (!this.edl) return;
    const cam1 = this.getVirtualCameras()[0] || { id: 'cam1', zoom: 1.0 };
    for (const seg of this.edl.segments) {
      seg.camera = cam1.id;
      seg.zoom = cam1.zoom;
    }
  }

  /** Check if project has multiple virtual cameras */
  hasMultipleCameras(): boolean {
    return this.getVirtualCameras().length > 1;
  }
}
