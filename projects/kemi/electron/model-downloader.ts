import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export type ModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3' | 'large-v3-turbo';

const MODEL_URLS: Record<ModelSize, string> = {
  'tiny': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  'medium': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  'large-v3': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
  'large-v3-turbo': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin'
};

export function getModelPath(modelSize: ModelSize, modelsDir: string): string {
  return path.join(modelsDir, `ggml-${modelSize}.bin`);
}

export async function downloadModel(
  modelSize: ModelSize,
  modelsDir: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const modelPath = getModelPath(modelSize, modelsDir);

  // Check if model already exists
  if (fs.existsSync(modelPath)) {
    return modelPath;
  }

  // Create models directory
  await fs.promises.mkdir(modelsDir, { recursive: true });

  const url = MODEL_URLS[modelSize];
  console.log(`Downloading model: ${modelSize} from ${url}`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(modelPath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    https.get(url, (response) => {
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
