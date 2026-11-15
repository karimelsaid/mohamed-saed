import * as ort from 'onnxruntime-node';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const VAD_MODEL_URL = 'https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx';

export async function downloadVADModel(modelsDir: string, onProgress: (progress: number) => void): Promise<string> {
  const modelPath = path.join(modelsDir, 'silero_vad.onnx');

  if (fs.existsSync(modelPath)) {
    return modelPath;
  }

  await fs.promises.mkdir(modelsDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(modelPath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    https.get(VAD_MODEL_URL, (response) => {
      totalBytes = parseInt(response.headers['content-length'] || '0', 10);

      response.pipe(file);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 100);
          onProgress(progress);
        }
      });

      file.on('finish', () => {
        file.close();
        resolve(modelPath);
      });

      file.on('error', (err) => {
        fs.unlink(modelPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(modelPath, () => {});
      reject(err);
    });
  });
}

export class SileroVAD {
  private session: ort.InferenceSession | null = null;
  private sampleRate = 16000;
  private windowSize = 512; // 32ms at 16kHz
  private context: Float32Array | null = null;

  async initialize(modelPath: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelPath);
    this.context = new Float32Array(this.windowSize);
  }

  async detectSpeech(audioData: Float32Array): Promise<boolean[]> {
    if (!this.session) {
      throw new Error('VAD not initialized');
    }

    const results: boolean[] = [];
    const numFrames = Math.floor(audioData.length / this.windowSize);

    for (let i = 0; i < numFrames; i++) {
      const start = i * this.windowSize;
      const end = start + this.windowSize;
      let frame = audioData.slice(start, end);

      // Pad if necessary
      if (frame.length < this.windowSize) {
        const padded = new Float32Array(this.windowSize);
        padded.set(frame);
        frame = padded;
      }

      const input = new ort.Tensor('float32', frame, [1, this.windowSize]);
      const outputs = await this.session.run({ input });
      const probability = Number(outputs.output?.data[0] || 0);

      results.push(probability > 0.5);
    }

    return results;
  }

  async detectSpeechRegions(
    audioData: Float32Array,
    minSilenceLength: number = 0.4,
    paddingMs: number = 0.15
  ): Promise<Array<{ start: number; end: number }>> {
    const speechProbabilities = await this.detectSpeech(audioData);
    const sampleRate = this.sampleRate;
    const windowSamples = this.windowSize;
    const minSilenceSamples = Math.floor(minSilenceLength * sampleRate);
    const paddingSamples = Math.floor(paddingMs * sampleRate);

    const regions: Array<{ start: number; end: number }> = [];
    let inSpeech = false;
    let currentStart = 0;

    for (let i = 0; i < speechProbabilities.length; i++) {
      const isSpeech = speechProbabilities[i];
      const startSample = i * windowSamples;

      if (isSpeech && !inSpeech) {
        currentStart = Math.max(0, startSample - paddingSamples);
        inSpeech = true;
      } else if (!isSpeech && inSpeech) {
        const endSample = Math.min(audioData.length, startSample + paddingSamples);
        regions.push({
          start: currentStart / sampleRate,
          end: endSample / sampleRate
        });
        inSpeech = false;
      }
    }

    // Handle case where audio ends in speech
    if (inSpeech) {
      regions.push({
        start: currentStart / sampleRate,
        end: audioData.length / sampleRate
      });
    }

    // Merge close regions
    const mergedRegions: Array<{ start: number; end: number }> = [];
    for (const region of regions) {
      if (mergedRegions.length === 0) {
        mergedRegions.push(region);
      } else {
        const last = mergedRegions[mergedRegions.length - 1];
        if (region.start - last.end < minSilenceLength) {
          last.end = region.end;
        } else {
          mergedRegions.push(region);
        }
      }
    }

    return mergedRegions;
  }

  dispose(): void {
    // In newer onnxruntime-node, session disposal is handled automatically
    this.session = null;
  }
}
