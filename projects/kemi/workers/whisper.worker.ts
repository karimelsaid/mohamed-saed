/// <reference types="node" />
import { parentPort, workerData } from 'worker_threads';
import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface TranscriptionWorkerData {
  audioPath: string;
  modelPath?: string;
  language?: string;
  modelSize?: string;
  enableWordTimestamps?: boolean;
}

interface TranscriptionResult {
  words: Array<{
    id: string;
    text: string;
    start: number;
    end: number;
    kind: 'word' | 'filler' | 'silence';
    removed: boolean;
    removeReason: any;
    confidence?: number;
  }>;
}

function getFfmpegDir(): string | null {
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    let p = ffmpegInstaller?.path;
    if (typeof p === 'string' && p.includes('app.asar')) {
      p = p.replace('app.asar', 'app.asar.unpacked');
    }
    if (p && fs.existsSync(p)) {
      return path.dirname(p);
    }
  } catch {}

  return null;
}

function findPythonExecutable(): string {
  if (process.env.PYTHON && fs.existsSync(process.env.PYTHON)) {
    return process.env.PYTHON;
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
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
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  return 'python3';
}

async function transcribeAudio(data: TranscriptionWorkerData): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const audioPath = data.audioPath;
    const language = data.language || 'ar';
    const modelSize = data.modelSize || 'base';

    console.log('Worker: Starting Python transcription with model:', modelSize);
    console.log('Worker: Audio path:', audioPath);
    console.log('Worker: Language:', language);

    let scriptPath = path.join(__dirname, '../../scripts/transcribe.py');
    let fallbackScriptPath = path.join(__dirname, '../scripts/transcribe.py');
    let finalScriptPath = fs.existsSync(scriptPath) ? scriptPath : fallbackScriptPath;

    if (finalScriptPath.includes('app.asar')) {
      const unpacked = finalScriptPath.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) {
        finalScriptPath = unpacked;
      }
    }

    const ffmpegDir = getFfmpegDir();
    const env = { ...process.env };
    env.PYTHONIOENCODING = 'utf-8';
    env.PYTHONUTF8 = '1';
    if (ffmpegDir) {
      env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;
      env.FFMPEG_DIR = ffmpegDir;
    }

    // Set local cache and temp directories on project drive to prevent Errno 28 (No space left on device)
    const projectDir = path.resolve(path.dirname(finalScriptPath), '..');
    const localCacheDir = path.join(projectDir, '.cache', 'whisper');
    const localTempDir = path.join(projectDir, '.cache', 'temp');
    try {
      if (!fs.existsSync(localCacheDir)) {
        fs.mkdirSync(localCacheDir, { recursive: true });
      }
      if (!fs.existsSync(localTempDir)) {
        fs.mkdirSync(localTempDir, { recursive: true });
      }
      if (!env.WHISPER_CACHE_DIR) {
        env.WHISPER_CACHE_DIR = localCacheDir;
      }
      env.TEMP = localTempDir;
      env.TMP = localTempDir;
    } catch (e) {
      console.warn('Worker: Failed to create local cache/temp directories:', e);
    }

    const args = [finalScriptPath, audioPath, language, modelSize];
    const pythonCmd = findPythonExecutable();
    console.log('Worker: Using Python executable:', pythonCmd);
    console.log('Worker: Script path:', finalScriptPath);

    const pyProcess = spawn(pythonCmd, args, {
      env,
      windowsHide: true,
      shell: false
    });

    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString('utf-8');
    });

    pyProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      stderrData += text;

      // Parse progress reports: PROGRESS: <percent>:<message> or tqdm: XX%|
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          const parts = line.substring(9).trim().split(':');
          const percent = parseInt(parts[0], 10);
          const message = parts.slice(1).join(':').trim() || 'جاري تحويل الصوت...';
          if (!isNaN(percent)) {
            parentPort?.postMessage({
              type: 'progress',
              percent,
              message
            });
          }
        } else {
          // Check for Whisper's internal tqdm progress bar (e.g. " 45%|████...")
          const tqdmMatch = line.match(/(\d{1,3})%\|/);
          if (tqdmMatch) {
            const whisperPct = parseInt(tqdmMatch[1], 10);
            if (!isNaN(whisperPct)) {
              // Map 0-100% of whisper audio decoding into 30% -> 90%
              const mappedPercent = Math.min(89, 30 + Math.round((whisperPct / 100) * 60));
              parentPort?.postMessage({
                type: 'progress',
                percent: mappedPercent,
                message: `جاري تفريغ الصوت وتحليل الكلمات... ${whisperPct}%`
              });
            }
          }
        }
      }
    });

    pyProcess.on('error', (err) => {
      console.error('Worker: Failed to spawn python:', err);
      reject(new Error(`فشل تشغيل مفسر Python (${pythonCmd}): ${err.message}. يرجى التأكد من تثبيت Python وإضافته لمتغيرات النظام (PATH).`));
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Worker: Python exited with code', code, 'stderr:', stderrData);
        try {
          const cleanStdout = stdoutData.trim();
          const jsonStart = cleanStdout.indexOf('{');
          const jsonEnd = cleanStdout.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const parsed = JSON.parse(cleanStdout.substring(jsonStart, jsonEnd + 1));
            if (parsed && parsed.error) {
              reject(new Error(parsed.error));
              return;
            }
          }
        } catch {}
        if (stderrData.includes("No module named 'whisper'") || stderrData.includes("No module named whisper")) {
          reject(new Error('مكتبة Whisper غير مثبتة في مفسر Python. يرجى فتح سطر الأوامر وتثبيتها بالأمر: pip install openai-whisper'));
          return;
        }
        if (stderrData.includes('Errno 28') || stderrData.includes('No space left on device')) {
          reject(new Error('مساحة القرص ممتلئة تماماً (Errno 28: No space left on device). يرجى تفريغ مساحة على القرص C ثم إعادة المحاولة.'));
          return;
        }
        if (stderrData.includes('11001') || stderrData.includes('getaddrinfo failed')) {
          reject(new Error('فشل الاتصال بالإنترنت لتحميل نموذج Whisper لأول مرة (خطأ 11001: تعذر الوصول إلى خادم التحميل). يرجى التأكد من اتصال الإنترنت أو تغيير DNS إلى 8.8.8.8.'));
          return;
        }
        if (stderrData.includes('MemoryError') || stderrData.includes('out of memory') || code === 3221225477 || code === 3221226505 || code === -1073741819 || code === -1073740791) {
          reject(new Error('نفدت الذاكرة العشوائية (RAM) أثناء التفريغ بنموذج ' + modelSize + '. يُنصح باختيار نموذج Small أو Base لسرعة واستقرار أكبر وتوفير الذاكرة على جهازك.'));
          return;
        }

        // Clean out PROGRESS lines and tqdm bars from stderrData to extract genuine errors
        const actualErrors = stderrData
          .split(/[\r\n]+/)
          .filter(l => !l.startsWith('PROGRESS:') && !l.includes('%|') && l.trim().length > 0)
          .join('\n')
          .trim();

        if (actualErrors) {
          reject(new Error(actualErrors));
          return;
        }

        reject(new Error(`عملية التفريغ الصوتي توقفت برمز (${code}). إذا كان جهازك يعمل على المعالج CPU وبذاكرة محدودة، يرجى اختيار نموذج Small أو Base لسرعة واستقرار فائقين.`));
        return;
      }

      try {
        const cleanStdout = stdoutData.trim();
        // Extract JSON if there is any other text around it
        const jsonStart = cleanStdout.indexOf('{');
        const jsonEnd = cleanStdout.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('لم يتم العثور على مخرجات JSON صالحة من Whisper');
        }

        const jsonString = cleanStdout.substring(jsonStart, jsonEnd + 1);
        const result = JSON.parse(jsonString);

        if (result.success && Array.isArray(result.words)) {
          console.log(`Worker: Transcription completed successfully with ${result.words.length} words`);
          resolve({ words: result.words });
        } else {
          reject(new Error(result.error || 'فشلت عملية التفريغ الصوتي'));
        }
      } catch (parseError: any) {
        console.error('Worker: JSON parse error:', parseError, 'Raw stdout:', stdoutData);
        reject(new Error(`فشل تحليل نتائج التفريغ الصوتي: ${parseError.message}`));
      }
    });
  });
}

async function run() {
  const data = workerData as TranscriptionWorkerData;
  console.log('Worker: Received data via workerData');
  try {
    const result = await transcribeAudio(data);
    parentPort?.postMessage({ type: 'result', success: true, result });
  } catch (error: any) {
    console.error('Worker: Transcription error:', error);
    parentPort?.postMessage({ type: 'result', success: false, error: error.message || String(error) });
  }
}

run();
