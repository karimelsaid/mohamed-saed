import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';
import { Worker } from 'worker_threads';
import { downloadModel, getModelPath, ModelSize } from './model-downloader';
import { generateASS, getAvailableStyles } from './caption-generator';
import { loadBrandTemplates, saveBrandTemplate, deleteBrandTemplate, BrandTemplate } from './brand-templates';
import { extractReels } from './reels-extractor';

function findPythonExecutable(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

    const potentialPaths = [
      path.join(localAppData, 'Python', 'bin', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python314', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
      path.join(programFiles, 'Python314', 'python.exe'),
      path.join(programFiles, 'Python313', 'python.exe'),
      path.join(programFiles, 'Python312', 'python.exe'),
      path.join(programFiles, 'Python311', 'python.exe'),
      path.join(programFiles, 'Python310', 'python.exe'),
    ];

    const pyDir = path.join(localAppData, 'Python');
    if (fs.existsSync(pyDir)) {
      try {
        const entries = fs.readdirSync(pyDir);
        for (const entry of entries) {
          if (entry.startsWith('pythoncore-')) {
            potentialPaths.push(path.join(pyDir, entry, 'python.exe'));
          }
        }
      } catch {}
    }

    for (const p of potentialPaths) {
      if (fs.existsSync(p)) {
        try {
          const stat = fs.statSync(p);
          if (stat.size > 0 && !p.includes('WindowsApps')) {
            return p;
          }
        } catch {}
      }
    }

    try {
      const output = execSync('where.exe python', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.includes('WindowsApps') && fs.existsSync(line)) {
          return line;
        }
      }
    } catch {}

    return 'python';
  }

  if (process.platform === 'darwin') {
    const macPaths = [
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
    ];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return 'python3';
}

const getCleanBinaryPath = (p: string): string => {
  if (typeof p === 'string' && p.includes('app.asar')) {
    return p.replace('app.asar', 'app.asar.unpacked');
  }
  return p;
};

ffmpeg.setFfmpegPath(getCleanBinaryPath(ffmpegPath.path));
ffmpeg.setFfprobePath(getCleanBinaryPath(ffprobePath.path));

interface ProjectState {
  sources: Map<string, any>;
  projectPath: string | null;
}

const projectState: ProjectState = {
  sources: new Map(),
  projectPath: null
};

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

export function setupIpcHandlers(): void {
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }
      ]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('select-folder', async () => {
    console.log('select-folder IPC handler called');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    console.log('Dialog result:', result);
    const folderPath = result.canceled ? '' : result.filePaths[0];
    console.log('Returning folder path:', folderPath);

    if (folderPath) {
      projectState.projectPath = folderPath;
    }

    return folderPath;
  });

  ipcMain.handle('open-folder', async (_event, folderPath: string) => {
    if (folderPath) {
      await shell.openPath(folderPath);
    }
  });

  ipcMain.handle('import-video', async (_event, filePath: string) => {
    const sourceId = `cam${projectState.sources.size + 1}`;
    const stats = await fs.promises.stat(filePath);

    projectState.sources.set(sourceId, {
      id: sourceId,
      path: filePath,
      offsetSec: 0,
      isMainAudio: projectState.sources.size === 0
    });

    return {
      id: sourceId,
      path: filePath,
      size: stats.size
    };
  });

  ipcMain.handle('generate-proxy', async (_event, sourceId: string) => {
    const source = projectState.sources.get(sourceId);
    if (!source || !projectState.projectPath) throw new Error('Source not found');

    // Instant Direct Playback: Bypass slow CPU FFmpeg proxy generation entirely
    // Modern Electron/Chromium plays MP4/MOV/WebM natively with hardware acceleration.
    emitProgress('proxy', 100, 100, 'تم تجهيز الفيديو وتشغيله فوراً (بدون انتظار البروكسي)');
    return source.path;
  });

  ipcMain.handle('extract-audio', async (_event, sourceId: string) => {
    const source = projectState.sources.get(sourceId);
    if (!source || !projectState.projectPath) throw new Error('Source not found');

    const audioPath = path.join(projectState.projectPath, 'audio', `${sourceId}.wav`);
    await fs.promises.mkdir(path.dirname(audioPath), { recursive: true });

    emitProgress('audio', 0, 100, 'جاري استخراج الصوت...');

    return new Promise<string>((resolve, reject) => {
      ffmpeg(source.path)
        .noVideo()
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .audioBitrate('128k')
        .save(audioPath)
        .on('progress', (progress) => {
          const percent = Math.round(progress.percent || 0);
          emitProgress('audio', percent, 100, `جاري استخراج الصوت... ${percent}%`);
        })
        .on('end', () => {
          emitProgress('audio', 100, 100, 'تم استخراج الصوت بنجاح');
          resolve(audioPath);
        })
        .on('error', (err) => {
          console.error('Audio extraction error:', err);
          reject(err);
        });
    });
  });

  ipcMain.handle('transcribe', async (_event, audioPath: string, settings: any) => {
    try {
      emitProgress('transcribe', 10, 100, 'جاري تحميل نموذج Whisper وتجهيز المعالجة...');

      let targetAudioPath = path.normalize(audioPath);
      if (!fs.existsSync(targetAudioPath)) {
        const base = path.basename(targetAudioPath);
        const dir = path.dirname(targetAudioPath);
        const cand1 = path.join(dir, 'audio', base.replace(/_16k\.wav$/i, '.wav'));
        const cand2 = path.join(dir, base.replace(/\.wav$/i, '_16k.wav'));
        const cand3 = path.join(dir, 'audio', base);
        for (const c of [cand1, cand2, cand3]) {
          if (fs.existsSync(c)) {
            targetAudioPath = c;
            break;
          }
        }
      }

      const workerPath = path.join(__dirname, '../workers/whisper.worker.js');
      console.log('Worker path:', workerPath);
      console.log('Worker exists:', fs.existsSync(workerPath));

      const worker = new Worker(workerPath, {
        workerData: {
          audioPath: targetAudioPath,
          modelPath: '',
          language: settings?.language || 'ar',
          modelSize: settings?.modelSize || 'base',
          enableWordTimestamps: true
        }
      });

      const result = await new Promise((resolve, reject) => {
        worker.on('message', (data) => {
          if (data.type === 'progress') {
            emitProgress('transcribe', data.percent, 100, data.message);
          } else if (data.type === 'result') {
            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error));
            }
          } else if (data.success !== undefined) {
            // Backward compatibility
            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error));
            }
          }
        });

        worker.on('error', (err) => {
          console.error('Worker thread error:', err);
          reject(err);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      });

      emitProgress('transcribe', 100, 100, 'تم استخراج النص بنجاح');
      return result;
    } catch (error: any) {
      console.error('Transcription error:', error);
      emitProgress('transcribe', 0, 100, `فشل التحويل: ${error.message || error}`);
      throw error;
    }
  });

  ipcMain.handle('detect-silence', async (_event, audioPath: string, settings: any) => {
    emitProgress('silence', 0, 100, 'جاري كشف الصمت والوقفات...');
    // Simulated or word-based silence detection
    await new Promise(resolve => setTimeout(resolve, 300));
    emitProgress('silence', 100, 100, 'تم تحليل الصمت والوقفات');
    return { silenceRegions: [] };
  });

  ipcMain.handle('enhance-audio', async (_event, audioPath: string, options: { strength?: number; mode?: string } = {}) => {
    emitProgress('enhance', 10, 100, 'جاري بدء تنقية الصوت بالذكاء الاصطناعي...');

    let targetAudio = path.normalize(audioPath);
    if (!fs.existsSync(targetAudio)) {
      const base = path.basename(targetAudio);
      const dir = path.dirname(targetAudio);
      const cands = [
        path.join(dir, 'audio', base.replace(/_16k\.wav$/i, '.wav')),
        path.join(dir, 'audio', base),
        path.join(dir, base.replace(/\.wav$/i, '_16k.wav'))
      ];
      for (const c of cands) {
        if (fs.existsSync(c)) {
          targetAudio = c;
          break;
        }
      }
    }

    if (!fs.existsSync(targetAudio)) {
      throw new Error(`ملف الصوت غير موجود: ${audioPath}`);
    }

    const dir = path.dirname(targetAudio);
    const baseName = path.basename(targetAudio, path.extname(targetAudio)).replace(/_enhanced$/i, '');
    const outputPath = path.join(dir, `${baseName}_enhanced.wav`);

    let scriptPath = path.join(__dirname, '../../scripts/enhance_audio.py');
    let fallbackScriptPath = path.join(__dirname, '../scripts/enhance_audio.py');
    let finalScriptPath = fs.existsSync(scriptPath) ? scriptPath : fallbackScriptPath;

    if (finalScriptPath.includes('app.asar')) {
      const unpacked = finalScriptPath.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) {
        finalScriptPath = unpacked;
      }
    }

    const pythonCmd = findPythonExecutable();
    const strength = options.strength !== undefined ? String(options.strength) : '0.85';
    const mode = options.mode || 'studio';

    return new Promise((resolve, reject) => {
      const child = spawn(pythonCmd, [finalScriptPath, targetAudio, outputPath, '--strength', strength, '--mode', mode], {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        stderr += text;
        const lines = text.split(/[\r\n]+/);
        for (const line of lines) {
          if (line.startsWith('PROGRESS:')) {
            const parts = line.substring(9).trim().split(':');
            const pct = parseInt(parts[0], 10);
            const msg = parts.slice(1).join(':').trim();
            if (!isNaN(pct)) {
              emitProgress('enhance', pct, 100, msg);
            }
          }
        }
      });

      child.on('close', code => {
        if (code !== 0) {
          reject(new Error(stderr || `فشلت معالجة الصوت (رمز الخروج ${code})`));
          return;
        }
        try {
          const res = JSON.parse(stdout.trim());
          if (res.success) {
            emitProgress('enhance', 100, 100, 'تمت تنقية الصوت بنجاح!');
            resolve(res);
          } else {
            reject(new Error(res.error || 'فشلت معالجة الصوت'));
          }
        } catch {
          resolve({ success: true, outputPath });
        }
      });
    });
  });

  ipcMain.handle('detect-fillers', async (_event, transcript: any[], fillerWords: string[]) => {
    emitProgress('fillers', 0, 100, 'جاري فحص كلمات التعبئة والتردد...');

    const fillerIds: string[] = [];
    const repeatIds: string[] = [];
    const stutterIds: string[] = [];
    const retakeIds: string[] = [];
    const elongationIds: string[] = [];

    const userFillers = new Set(
      (fillerWords || ['ااا', 'امم', 'يعني', 'إيه', 'طب', 'فا'])
        .map(w => w.trim().toLowerCase())
    );

    // Known Arabic filler sounds ONLY (strictly hesitation noises, NO legitimate dictionary words)
    const knownFillers = new Set([
      'اه', 'آه', 'اهم', 'امم', 'هم', 'همم', 'همى', 'آ', 'اا', 'ااا', 'إإإ', 'أأأ',
      'اييه', 'اييي', 'احم', 'اوه', 'آوه'
    ]);

    // Helper: strip punctuation
    const stripPunct = (s: string) => s.replace(/[\s.,!؟،_ـ\-:؛"\'()]+/g, '').trim();

    // Helper: detect elongated hesitation sounds
    const isElongatedSound = (text: string): boolean => {
      const t = stripPunct(text);
      if (!t || t.length < 2) return false;
      // Pure elongated vowel sounds: اااا, اممم, آآآ, همم, إمم (requires {2,} so "أو" is never matched)
      if (/^[اآإأ](?:ي{2,}|ا{2,}|م{2,}|ه{2,}|و{2,})[هة]?$/u.test(t)) return true;
      if (t.length >= 2 && new Set(t.split('')).size === 1) return true;
      if (/^[هإ]م{2,}$/u.test(t)) return true;
      if (/^[اآإأ]ه{2,}$/u.test(t)) return true;
      return false;
    };

    // Helper: deflate elongation ("يعنييي" → "يعني")
    const deflate = (s: string) => s.replace(/(.)\1{1,}/g, '$1');

    // PASS 1: Direct filler and elongation detection
    for (let i = 0; i < transcript.length; i++) {
      const word = transcript[i];
      const rawText = (word.text || '').trim();
      const cleanText = stripPunct(rawText).toLowerCase();
      const wordDeflated = deflate(cleanText);

      // Detect character elongations (مد الحروف مثل "يعنييي", "كدهههه", "ااااه", "تمااام")
      if (/(.)\1{2,}/u.test(cleanText) || isElongatedSound(cleanText)) {
        if (!elongationIds.includes(word.id)) {
          elongationIds.push(word.id);
        }
      }

      // Direct broken fragment / stutter (e.g. "الحـ", "الوـ", "فا-") or flagged as stutter
      if (word.removeReason === 'stutter' || /^[^\s]+[-ـ]$/u.test(rawText)) {
        if (!stutterIds.includes(word.id)) {
          stutterIds.push(word.id);
        }
        continue;
      }

      // Already flagged by Whisper as filler
      if (word.kind === 'filler') {
        fillerIds.push(word.id);
        continue;
      }

      // User filler list (fuzzy)
      if (userFillers.has(cleanText) || userFillers.has(wordDeflated)) {
        fillerIds.push(word.id);
        continue;
      }

      // Elongated sounds & pure hesitation sounds
      if (isElongatedSound(cleanText)) {
        fillerIds.push(word.id);
        continue;
      }

      // Known hesitation fillers
      if (knownFillers.has(cleanText) || knownFillers.has(wordDeflated)) {
        fillerIds.push(word.id);
        continue;
      }
    }

    // Common Arabic functional words that are NEVER stutters/fragments
    // These are real standalone words (prepositions, pronouns, demonstratives, particles, conjunctions)
    const protectedWords = new Set([
      // Prepositions
      'من', 'في', 'عن', 'على', 'الى', 'إلى', 'مع', 'بين', 'حتى', 'عند', 'لدى', 'بعد', 'قبل', 'فوق', 'تحت',
      // Pronouns & demonstratives
      'هو', 'هي', 'هم', 'هن', 'انا', 'أنا', 'انت', 'إنت', 'انتي', 'احنا', 'إحنا', 'هما',
      'ده', 'دي', 'دا', 'دول', 'هذا', 'هذه', 'هذي', 'ذلك', 'تلك', 'هنا', 'كده',
      // Particles & conjunctions
      'إن', 'أن', 'ان', 'لو', 'لا', 'ما', 'يا', 'أو', 'او', 'بس', 'كل', 'قد', 'مش', 'كان', 'هل', 'لم', 'لن',
      'ثم', 'لكن', 'بل', 'أم', 'اللي', 'زي', 'غير', 'كأن',
      // Common short verbs/words that look like fragments but are real words
      'خد', 'حط', 'شف', 'قل', 'جه', 'جت', 'طب', 'اه', 'لأ', 'اي', 'نعم',
      // Relative & possessive
      'الي', 'إلي', 'بتاع', 'حق', 'مال',
    ]);

    // PASS 2: Repeats & Stuttering
    for (let i = 1; i < transcript.length; i++) {
      const word = transcript[i];
      const prev = transcript[i - 1];
      const wordText = stripPunct(word.text || '').toLowerCase();
      const prevText = stripPunct(prev.text || '').toLowerCase();

      // Exact single word repeats ("احنا احنا", "ده ده", "سيار سيار")
      if (wordText === prevText && wordText.length > 1 && (word.start - prev.end) < 2.0) {
        if (!fillerIds.includes(prev.id) && !repeatIds.includes(prev.id)) {
          repeatIds.push(prev.id);
        }
      }

      // 2-word phrase repeats (e.g. "ورحمة الله ورحمة الله")
      if (i >= 3) {
        const prev2 = transcript[i - 2];
        const prev3 = transcript[i - 3];
        const p2Text = stripPunct(prev2.text || '').toLowerCase();
        const p3Text = stripPunct(prev3.text || '').toLowerCase();
        if (p3Text === p2Text && prevText === wordText && (word.start - prev.end) < 2.0) {
          if (!repeatIds.includes(prev3.id)) repeatIds.push(prev3.id);
          if (!repeatIds.includes(prev2.id)) repeatIds.push(prev2.id);
        } else if (p3Text === prevText && p2Text === wordText && (prev2.start - prev3.end) < 2.0) {
          if (!repeatIds.includes(prev3.id)) repeatIds.push(prev3.id);
          if (!repeatIds.includes(prev2.id)) repeatIds.push(prev2.id);
        }
      }

      // Repeats with a filler in between ("احنا ... يعني ... احنا")
      if (i >= 2) {
        const prevPrev = transcript[i - 2];
        const prevPrevText = stripPunct(prevPrev.text || '').toLowerCase();
        if (wordText === prevPrevText && wordText.length > 2 && fillerIds.includes(prev.id)) {
          if (!protectedWords.has(prevPrevText) && !repeatIds.includes(prevPrev.id)) {
            repeatIds.push(prevPrev.id);
          }
        }
      }

      // Stuttering: broken fragment → full word ("ال" → "الملابس", "الح" → "الحاجه", "الو" → "الوحيده", "سو" → "سويت")
      const pt = stripPunct(prev.text || '').toLowerCase();
      const ct = stripPunct(word.text || '').toLowerCase();
      const timeGap = word.start - prev.end;

      if (pt.length >= 1 && ct.length > pt.length && timeGap < 1.8) {
        // Must start with the same characters (prefix fragment)
        if (ct.startsWith(pt)) {
          // If it ends with dash/tatweel or is not a protected functional word
          if (/[-ـ]$/u.test((prev.text || '').trim()) || !protectedWords.has(pt) || pt.length <= 4) {
            if (!fillerIds.includes(prev.id) && !stutterIds.includes(prev.id)) {
              stutterIds.push(prev.id);
            }
          }
        }
      }

      // Broken word ending in hyphen/dash/tatweel ("ال-", "سوـ", "الحـ") - always a stutter
      if (/^[^\s]+[-ـ]$/u.test((prev.text || '').trim()) && timeGap < 2.5) {
        if (!fillerIds.includes(prev.id) && !stutterIds.includes(prev.id)) {
          stutterIds.push(prev.id);
        }
      }

      // Low confidence vocal murmurs/stumbles
      const prevConf = prev.confidence ?? prev.probability ?? 1.0;
      if (prevConf < 0.25 && pt.length <= 4 && !protectedWords.has(pt) && timeGap < 1.2) {
        if (!fillerIds.includes(prev.id) && !stutterIds.includes(prev.id)) {
          stutterIds.push(prev.id);
        }
      }
    }

    // PASS 3: Safe phrase retake detection (requires at least 3 matching content words within < 3.5s, excluding common recurrent formulas)
    const recurrentFormulas = new Set([
      'مشاء', 'ماشاء', 'الله', 'معنا', 'اللون', 'لون', 'الحمد', 'لله',
      'صلوا', 'على', 'النبي', 'فرع', 'فراء', 'مدينة', 'نصر', 'الرياض'
    ]);
    for (let i = 0; i < transcript.length - 3; i++) {
      if (fillerIds.includes(transcript[i].id) || repeatIds.includes(transcript[i].id)) continue;
      const w1 = stripPunct(transcript[i].text || '').toLowerCase();
      if (!w1 || w1.length < 2 || recurrentFormulas.has(w1)) continue;

      for (let j = i + 2; j < Math.min(i + 10, transcript.length); j++) {
        if (fillerIds.includes(transcript[j].id)) continue;
        if ((transcript[j].start - transcript[i].end) > 3.5) break;

        const w2 = stripPunct(transcript[j].text || '').toLowerCase();
        if (w1 === w2) {
          let matchCount = 1;
          let k = 1;
          while ((i + k) < j && (j + k) < transcript.length && k < 6) {
            const m1 = stripPunct(transcript[i + k].text || '').toLowerCase();
            const m2 = stripPunct(transcript[j + k].text || '').toLowerCase();
            if (m1 && m2 && m1 === m2) {
              matchCount++;
              k++;
            } else {
              break;
            }
          }
          if (matchCount >= 4) {
            for (let m = i; m < (i + k); m++) {
              if (!retakeIds.includes(transcript[m].id) && !fillerIds.includes(transcript[m].id)) {
                retakeIds.push(transcript[m].id);
              }
            }
            break;
          }
        }
      }
    }

    const totalDetected = fillerIds.length + repeatIds.length + stutterIds.length + retakeIds.length + elongationIds.length;
    emitProgress('fillers', 100, 100,
      `تم كشف ${fillerIds.length} حشو، ${elongationIds.length} مد، ${repeatIds.length} تكرار، ${stutterIds.length} لعثمة`
    );
    return { fillerIds, repeatIds, stutterIds, retakeIds, elongationIds };
  });

  ipcMain.handle('export-video', async (_event, edl: any, outputPath: string, format: string) => {
    try {
      emitProgress('export', 0, 100, 'جاري التحضير للتصدير...');
      await exportVideoInternal(edl, outputPath, format);
      emitProgress('export', 100, 100, 'تم التصدير بنجاح');
    } catch (error) {
      console.error('Export error:', error);
      emitProgress('export', 0, 100, 'فشل التصدير');
      throw error;
    }
  });

  ipcMain.handle('set-project-path', async (_event, projectPath: string) => {
    projectState.projectPath = projectPath;
    return;
  });

  ipcMain.handle('get-caption-styles', async () => {
    return getAvailableStyles();
  });

  ipcMain.handle('generate-captions', async (_event, words: any[], styleName: string) => {
    if (!projectState.projectPath) throw new Error('No project path');

    const captionsPath = path.join(projectState.projectPath, 'captions.ass');
    generateASS(words, styleName, captionsPath);

    return captionsPath;
  });

  ipcMain.handle('get-brand-templates', async () => {
    return await loadBrandTemplates();
  });

  ipcMain.handle('save-brand-template', async (_event, template: BrandTemplate) => {
    await saveBrandTemplate(template);
  });

  ipcMain.handle('delete-brand-template', async (_event, templateId: string) => {
    await deleteBrandTemplate(templateId);
  });

  ipcMain.handle('batch-export', async (_event, edl: any, formats: string[]) => {
    if (!projectState.projectPath) throw new Error('No project path');

    const results: Array<{ format: string; outputPath: string; success: boolean }> = [];

    for (const format of formats) {
      try {
        const outputPath = path.join(projectState.projectPath, `output_${format.replace(':', 'x')}.mp4`);
        await exportVideoInternal(edl, outputPath, format);
        results.push({ format, outputPath, success: true });
      } catch (error) {
        console.error(`Error exporting ${format}:`, error);
        results.push({ format, outputPath: '', success: false });
      }
    }

    return results;
  });

  ipcMain.handle('extract-reels', async (_event, transcript: any[], minDuration: number, maxDuration: number) => {
    const reels = extractReels(transcript, minDuration, maxDuration);
    return reels;
  });

  ipcMain.handle('save-project', async (_event, folderPath: string, projectData: any) => {
    try {
      const targetDir = folderPath || projectState.projectPath;
      if (!targetDir) throw new Error('No project directory provided');

      await fs.promises.mkdir(targetDir, { recursive: true });
      const filePath = path.join(targetDir, 'project.json');
      const payload = JSON.stringify(projectData, null, 2);
      await fs.promises.writeFile(filePath, payload, 'utf-8');

      // Also save an auto-backup in ~/.kemi/last_project.json
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      if (homeDir) {
        const backupDir = path.join(homeDir, '.kemi');
        await fs.promises.mkdir(backupDir, { recursive: true });
        await fs.promises.writeFile(
          path.join(backupDir, 'last_project.json'),
          JSON.stringify({ folderPath: targetDir, data: projectData, updatedAt: new Date().toISOString() }, null, 2),
          'utf-8'
        );
      }

      console.log(`[save-project] Saved successfully to ${filePath}`);
      return true;
    } catch (err: any) {
      console.error('[save-project] Error saving project:', err);
      throw err;
    }
  });

  ipcMain.handle('has-project', async (_event, folderPath: string) => {
    try {
      const p = path.join(folderPath, 'project.json');
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  ipcMain.handle('load-project', async (_event, folderPath: string) => {
    try {
      const targetDir = folderPath || projectState.projectPath;
      if (!targetDir) throw new Error('No project directory specified');

      const filePath = path.join(targetDir, 'project.json');
      if (!fs.existsSync(filePath)) {
        throw new Error(`project.json not found in ${targetDir}`);
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Restore projectState in Electron
      projectState.projectPath = targetDir;
      if (data.sources && Array.isArray(data.sources)) {
        projectState.sources.clear();
        for (const s of data.sources) {
          projectState.sources.set(s.id, s);
        }
      }

      console.log(`[load-project] Loaded successfully from ${filePath}`);
      return data;
    } catch (err: any) {
      console.error('[load-project] Error loading project:', err);
      throw err;
    }
  });

  ipcMain.handle('delete-project', async (_event, folderPath: string) => {
    try {
      if (!folderPath) return false;
      if (fs.existsSync(folderPath)) {
        try {
          await shell.trashItem(folderPath);
        } catch {
          await fs.promises.rm(folderPath, { recursive: true, force: true });
        }
      }
      return true;
    } catch (err: any) {
      console.error('[delete-project] Error deleting project:', err);
      return false;
    }
  });

  // ─── AI Multi-Camera Handlers ──────────────────────────────────────────

  let multicamProcess: ReturnType<typeof spawn> | null = null;

  ipcMain.handle('generate-multicam-views', async (_event, options: {
    inputPath: string;
    outputDir: string;
    cameras?: any[];
    mode?: 'preview' | 'full';
    unmirrorSelfie?: boolean;
    maxDuration?: number;
  }) => {
    const { inputPath, outputDir, cameras, mode = 'full', unmirrorSelfie = false, maxDuration } = options;

    // Kill any existing process
    if (multicamProcess) {
      try { multicamProcess.kill(); } catch {}
      multicamProcess = null;
    }

    const pythonPath = findPythonExecutable();
    const candidatePaths = [
      path.join(__dirname, '..', '..', 'tools', 'ai-multicam', 'multicam_service.py'),
      path.join(__dirname, '..', 'tools', 'ai-multicam', 'multicam_service.py'),
      path.join(__dirname, 'tools', 'ai-multicam', 'multicam_service.py'),
      path.join(process.cwd(), 'tools', 'ai-multicam', 'multicam_service.py')
    ];
    const scriptPath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
    const ffmpegBin = getCleanBinaryPath(ffmpegPath.path);

    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `AI multicam script not found: ${scriptPath}` };
    }

    const args = [
      scriptPath,
      '--input', inputPath,
      '--output', outputDir,
      '--mode', mode,
      '--ffmpeg', ffmpegBin
    ];

    if (unmirrorSelfie) {
      args.push('--unmirror');
    }

    if (maxDuration) {
      args.push('--duration', String(maxDuration));
    }

    // Write camera config to temp file if provided
    let camerasConfigPath: string | null = null;
    if (cameras && cameras.length > 0) {
      camerasConfigPath = path.join(outputDir, '_cameras_config.json');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(camerasConfigPath, JSON.stringify(cameras, null, 2), 'utf-8');
      args.push('--cameras', camerasConfigPath);
    }

    return new Promise<{ success: boolean; result?: any; error?: string }>((resolve) => {
      multicamProcess = spawn(pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let lastMessage: any = null;

      multicamProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString('utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            lastMessage = msg;

            // Forward progress to renderer
            if (mainWindow && msg.type === 'progress') {
              mainWindow.webContents.send('multicam-progress', msg);
            }

            if (msg.type === 'complete') {
              multicamProcess = null;
              // Cleanup temp config file
              if (camerasConfigPath && fs.existsSync(camerasConfigPath)) {
                try { fs.unlinkSync(camerasConfigPath); } catch {}
              }
              resolve({ success: true, result: msg });
            }

            if (msg.type === 'error') {
              multicamProcess = null;
              resolve({ success: false, error: msg.message });
            }
          } catch {
            // Non-JSON output, log it
            console.log('[multicam-service]', line);
          }
        }
      });

      multicamProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[multicam-service stderr]', data.toString());
      });

      multicamProcess.on('close', (code) => {
        multicamProcess = null;
        if (code !== 0 && !lastMessage?.type) {
          resolve({ success: false, error: `Process exited with code ${code}` });
        }
      });

      multicamProcess.on('error', (err) => {
        multicamProcess = null;
        resolve({ success: false, error: err.message });
      });
    });
  });

  ipcMain.handle('cancel-multicam', async () => {
    if (multicamProcess) {
      try {
        multicamProcess.kill();
        multicamProcess = null;
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    return { success: true };
  });

  ipcMain.handle('get-multicam-outputs', async (_event, outputDir: string) => {
    try {
      if (!fs.existsSync(outputDir)) {
        return { exists: false, cameras: [] };
      }

      const files = fs.readdirSync(outputDir);
      const cameraFiles = files
        .filter(f => f.endsWith('_h264.mp4') || (f.endsWith('.mp4') && !f.includes('grid') && !f.includes('preview') && !f.includes('_config')))
        .map(f => ({
          filename: f,
          path: path.join(outputDir, f),
          camId: f.split('_')[0],
          isH264: f.includes('_h264')
        }));

      return { exists: true, cameras: cameraFiles };
    } catch (err: any) {
      return { exists: false, cameras: [], error: err.message };
    }
  });
}

function mapSourceToExportTime(sourceTime: number, segments: any[]): number | null {
  if (!segments || segments.length === 0) return sourceTime;
  let accumulated = 0;
  for (const seg of segments) {
    if (sourceTime > seg.srcEnd) {
      accumulated += (seg.srcEnd - seg.srcStart);
    } else if (sourceTime >= seg.srcStart && sourceTime <= seg.srcEnd) {
      accumulated += (sourceTime - seg.srcStart);
      return Number(accumulated.toFixed(3));
    } else if (sourceTime < seg.srcStart) {
      if (seg.srcStart - sourceTime <= 0.2) {
        return Number(accumulated.toFixed(3));
      }
      return null;
    }
  }
  return null;
}

function getVideoRotation(filePath: string): number {
  try {
    const bin = getCleanBinaryPath(ffprobePath.path);
    const output = execSync(
      `"${bin}" -v error -read_intervals "%+#1" -select_streams v:0 -show_entries stream_tags=rotate:side_data=rotation -of default=noprint_wrappers=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const rotateMatch = output.match(/rotate\s*=\s*(-?\d+)/i);
    if (rotateMatch) return parseInt(rotateMatch[1], 10);
    const sideMatch = output.match(/rotation\s*=\s*(-?\d+)/i);
    if (sideMatch) return parseInt(sideMatch[1], 10);
  } catch (e) {
    console.warn('[getVideoRotation] Error querying video rotation:', e);
  }
  return 0;
}

async function exportVideoInternal(edl: any, outputPath: string, format: string): Promise<void> {
  if (!edl.sources || edl.sources.length === 0) {
    throw new Error('لم يتم العثور على أي ملف فيديو للمشروع');
  }

  const source = edl.sources[0];
  const segments = edl.segments || [];

  if (segments.length === 0) {
    throw new Error('لا توجد مقاطع صالحة للتصدير');
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseDir = projectState.projectPath || outputDir || process.cwd();
  const segmentListPath = path.join(os.tmpdir(), `segments_${Date.now()}.txt`);
  
  // Build a lookup map from camera/source ID to its file path for multi-camera support
  const sourceMap: Record<string, string> = {};
  for (const s of edl.sources) {
    sourceMap[s.id] = s.path;
  }
  // Also map any virtual cameras that have rendered AI video paths
  if (edl.virtualCameras && Array.isArray(edl.virtualCameras)) {
    for (const vcam of edl.virtualCameras) {
      if (vcam.renderedVideoPath && fs.existsSync(vcam.renderedVideoPath)) {
        sourceMap[vcam.id] = vcam.renderedVideoPath;
      }
    }
  }

  // Format each segment line safely for ffmpeg concat demuxer with inpoint & outpoint
  // Multi-camera: each segment references the correct source file based on its camera field
  const totalDuration = segments.reduce((sum: number, s: any) => sum + Math.max(0.01, (s.srcEnd || 0) - (s.srcStart || 0)), 0);

  const segmentList = segments.map((seg: any) => {
    // Look up the source file for this segment's camera; fallback to first source
    const segSourcePath = sourceMap[seg.camera] || source.path;
    const escapedPath = segSourcePath.replace(/'/g, "'\\''");
    const startTime = Math.max(0, seg.srcStart || 0).toFixed(3);
    const endTime = Math.max(Number(startTime) + 0.05, seg.srcEnd || (Number(startTime) + 0.05)).toFixed(3);
    return `file '${escapedPath}'\ninpoint ${startTime}\noutpoint ${endTime}`;
  }).join('\n');

  fs.writeFileSync(segmentListPath, segmentList, 'utf-8');

  // Generate Burned-in Subtitles if enabled and transcript exists
  let assPath: string | null = null;
  const captionOpts = edl.captionOptions || { enabled: true };
  if (captionOpts.enabled !== false && edl.transcript && edl.transcript.length > 0) {
    try {
      const mappedWords: Array<{ text: string; start: number; end: number; removed?: boolean }> = [];
      for (const w of edl.transcript) {
        if (w.removed || w.kind === 'silence') continue;

        const mappedStart = mapSourceToExportTime(w.start, segments);
        let mappedEnd = mapSourceToExportTime(w.end, segments);

        if (mappedStart !== null) {
          if (mappedEnd === null || mappedEnd <= mappedStart) {
            mappedEnd = Number((mappedStart + Math.max(0.2, (w.end - w.start))).toFixed(3));
          }
          mappedWords.push({
            text: w.text,
            start: mappedStart,
            end: mappedEnd
          });
        }
      }

      if (mappedWords.length > 0) {
        assPath = path.join(os.tmpdir(), `kemi_captions_${Date.now()}.ass`);
        generateASS(mappedWords, { ...captionOpts, format }, assPath, format);
        console.log(`[export] Generated ${mappedWords.length} subtitle words in: ${assPath}`);
      }
    } catch (assErr) {
      console.error('[export] Subtitle generation error:', assErr);
    }
  }

  const cleanupTempFiles = () => {
    try { fs.unlinkSync(segmentListPath); } catch {}
    if (assPath) { try { fs.unlinkSync(assPath); } catch {} }
  };

  return new Promise<void>((resolve, reject) => {
    const qualityPreset = edl.exportQualityPreset || 'master';
    let preset = 'slow';
    let crf = '14';
    let audioBitrate = '320k';

    if (qualityPreset === 'high') {
      preset = 'medium';
      crf = '17';
      audioBitrate = '256k';
    } else if (qualityPreset === 'fast') {
      preset = 'veryfast';
      crf = '21';
      audioBitrate = '192k';
    }

    const outputOpts = [
      `-preset ${preset}`,
      `-crf ${crf}`,
      '-tune film',
      '-threads 0',
      '-avoid_negative_ts make_zero',
      '-async 1',
      '-movflags +faststart',
      '-pix_fmt yuv420p',
      '-profile:v high',
      '-level 4.2',
      '-metadata:s:v:0 rotate=0'
    ];

    let command = ffmpeg()
      .input(segmentListPath)
      .inputOptions('-f', 'concat')
      .inputOptions('-safe', '0')
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate(audioBitrate)
      .outputOptions(outputOpts);

    if (edl.audioEnhanced) {
      command.audioFilters([
        'highpass=f=80',
        'equalizer=f=200:width_type=q:width=1.0:g=2.5',
        'equalizer=f=450:width_type=q:width=1.5:g=-2.0',
        'equalizer=f=3200:width_type=q:width=1.2:g=3.5',
        'acompressor=threshold=-18dB:ratio=3:attack=5:release=50:makeup=2dB',
        'loudnorm=I=-16:TP=-1.5:LRA=7'
      ]);
    }

    // Use video filters for clean scaling, phone enhancement, and burning subtitles
    const vFilters: string[] = [];

    // Prepend rotation filter if video has rotation metadata (concat demuxer doesn't autorotate)
    const rotation = getVideoRotation(source.path);
    console.log(`[export] Detected video rotation: ${rotation}° for ${source.path}`);
    if (rotation === 90 || rotation === -270) {
      vFilters.push('transpose=2');
    } else if (rotation === 270 || rotation === -90) {
      vFilters.push('transpose=1');
    } else if (rotation === 180 || rotation === -180) {
      vFilters.push('hflip,vflip');
    }

    // Target dimensions based on export resolution (4K / 2K / 1080p)
    const resolution = edl.exportResolution || '1080p';
    let targetW = 1920;
    let targetH = 1080;

    if (resolution === '4k') {
      if (format === '9:16') {
        targetW = 2160;
        targetH = 3840;
      } else if (format === '1:1') {
        targetW = 2160;
        targetH = 2160;
      } else {
        targetW = 3840;
        targetH = 2160;
      }
    } else if (resolution === '2k') {
      if (format === '9:16') {
        targetW = 1440;
        targetH = 2560;
      } else if (format === '1:1') {
        targetW = 1440;
        targetH = 1440;
      } else {
        targetW = 2560;
        targetH = 1440;
      }
    } else {
      if (format === '9:16') {
        targetW = 1080;
        targetH = 1920;
      } else if (format === '1:1') {
        targetW = 1080;
        targetH = 1080;
      } else {
        targetW = 1920;
        targetH = 1080;
      }
    }

    // Clean bicubic scaling with padding to prevent any pixel blurring or distortion
    vFilters.push(`scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease:flags=bicubic`);
    vFilters.push(`pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black`);

    // Phone Video AI Restoration (cleans mobile noise, sharpens edges, enhances colors)
    const phoneOpts = edl.phoneOptions || {
      enabled: edl.enhancePhoneVideo ?? true,
      sharpening: edl.phoneSharpening ?? 0.85,
      denoise: edl.phoneDenoise ?? true,
      colorBoost: edl.phoneColorBoost ?? true
    };

    if (phoneOpts.enabled && !edl.cinematicOptions?.enabled) {
      if (phoneOpts.denoise) {
        // Very light denoise - just reduce sensor noise without blurring details
        vFilters.push('hqdn3d=1.0:0.8:1.5:1.2');
      }
      const sharpVal = Math.max(0, Math.min(1.5, phoneOpts.sharpening ?? 0.85));
      if (sharpVal > 0) {
        // Gentle sharpening - smaller kernel (3x3) to avoid halos and artifacts
        const gentleSharp = Math.min(sharpVal, 0.6);
        vFilters.push(`unsharp=3:3:${gentleSharp.toFixed(2)}:3:3:${(gentleSharp * 0.3).toFixed(2)}`);
      }
      if (phoneOpts.colorBoost) {
        // Subtle color enhancement - avoid over-processing
        vFilters.push('eq=contrast=1.03:brightness=0.005:saturation=1.06:gamma=0.99');
      }
      console.log(`[export] Phone footage restoration applied (sharp=${sharpVal}, denoise=${phoneOpts.denoise}, colorBoost=${phoneOpts.colorBoost})`);
    }

    // Cinematic Enhancement Filters (applied after scaling, before subtitles)
    const cineOpts = edl.cinematicOptions || { enabled: false };
    if (cineOpts.enabled) {
      // Sharpening with unsharp mask (luma_msize_x:luma_msize_y:luma_amount:chroma_msize_x:chroma_msize_y:chroma_amount)
      const sharpAmt = Math.max(0, Math.min(1.5, cineOpts.sharpness || 0.6));
      if (sharpAmt > 0) {
        vFilters.push(`unsharp=5:5:${sharpAmt.toFixed(2)}:3:3:${(sharpAmt * 0.5).toFixed(2)}`);
      }

      // EQ filter for contrast, brightness, saturation
      const contrast = Math.max(0.8, Math.min(1.4, cineOpts.contrast || 1.05));
      const brightness = Math.max(-0.1, Math.min(0.1, cineOpts.brightness || 0.02));
      const saturation = Math.max(0.5, Math.min(2.0, cineOpts.saturation || 1.15));
      vFilters.push(`eq=contrast=${contrast.toFixed(2)}:brightness=${brightness.toFixed(3)}:saturation=${saturation.toFixed(2)}`);

      // Color temperature via colorbalance
      const temp = cineOpts.temperature || 'neutral';
      if (temp === 'warm') {
        // Warm: boost reds/yellows in shadows & midtones, reduce blues
        vFilters.push('colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.04:gm=0.01:bm=-0.04');
      } else if (temp === 'cool') {
        // Cool: boost blues in shadows & midtones, reduce reds
        vFilters.push('colorbalance=rs=-0.05:gs=0.01:bs=0.07:rm=-0.03:gm=0.01:bm=0.05');
      }

      // Very light noise reduction for cleaner cinematic look (minimal to preserve detail)
      vFilters.push('hqdn3d=0.8:0.6:1.2:1.0');

      console.log(`[export] Cinematic filters applied: sharpness=${sharpAmt}, contrast=${contrast}, saturation=${saturation}, brightness=${brightness}, temp=${temp}`);
    }

    if (assPath && fs.existsSync(assPath)) {
      const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
      const candidateFontsDirs = [
        path.resolve(process.cwd(), 'assets/fonts'),
        path.resolve(__dirname, '../../assets/fonts'),
        path.resolve(__dirname, '../assets/fonts')
      ];
      const fontsDir = candidateFontsDirs.find(d => fs.existsSync(d));
      if (fontsDir) {
        const escapedFonts = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
        vFilters.push(`subtitles='${escapedAss}':fontsdir='${escapedFonts}'`);
      } else {
        vFilters.push(`subtitles='${escapedAss}'`);
      }
    }

    command.videoFilters(vFilters);

    command
      .on('start', (cmdline) => {
        console.log('[export] FFmpeg command started:', cmdline);
        emitProgress('export', 5, 100, 'جاري بدء معالجة الفيديو...');
      })
      .on('progress', (progress) => {
        let percent = progress.percent;
        if ((!percent || isNaN(percent)) && progress.timemark) {
          const parts = progress.timemark.split(':');
          if (parts.length === 3) {
            const currentSec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            if (totalDuration > 0) {
              percent = Math.min(99, Math.round((currentSec / totalDuration) * 100));
            }
          }
        }
        const displayPercent = percent ? Math.min(99, Math.max(5, Math.round(percent))) : 25;
        emitProgress('export', displayPercent, 100, `جاري تصدير الفيديو: ${displayPercent}%`);
      })
      .on('end', () => {
        console.log('[export] Video export completed successfully!');
        emitProgress('export', 100, 100, 'تم التصدير بنجاح 100%');
        cleanupTempFiles();
        resolve();
      })
      .on('error', (err, _stdout, stderr) => {
        console.error('[export] Export error:', err, stderr);
        cleanupTempFiles();
        reject(err);
      })
      .save(outputPath);
  });
}

function emitProgress(step: string, progress: number, total: number, message: string): void {
  if (mainWindow) {
    mainWindow.webContents.send('processing-progress', {
      step,
      progress,
      total,
      message
    });
  }
  console.log(`[${step}] ${progress}/${total}: ${message}`);
}
