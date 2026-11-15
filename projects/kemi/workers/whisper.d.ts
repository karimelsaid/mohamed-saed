declare module 'whisper.cpp' {
  export interface WhisperFactory {
    create(options: WhisperOptions): Promise<WhisperInstance>;
  }

  export interface WhisperOptions {
    modelPath: string;
    language?: string;
    enableWordTimestamps?: boolean;
    printProgress?: boolean;
    printSpecialTokens?: boolean;
    printRealtime?: boolean;
    printTimestamps?: boolean;
  }

  export interface WhisperInstance {
    transcribeFile(filePath: string): Promise<TranscriptionResult>;
    close(): void;
  }

  export interface TranscriptionResult {
    segments?: TranscriptionSegment[];
    text?: string;
  }

  export interface TranscriptionSegment {
    start: number;
    end: number;
    text: string;
    words?: TranscriptionWord[];
  }

  export interface TranscriptionWord {
    word: string;
    start: number;
    end: number;
  }

  export const WhisperFactory: WhisperFactory;
}
