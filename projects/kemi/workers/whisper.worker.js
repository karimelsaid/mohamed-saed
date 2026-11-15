"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const whisper_cpp_1 = require("whisper.cpp");
async function transcribeAudio(data) {
    try {
        // Create Whisper instance
        const whisper = await whisper_cpp_1.WhisperFactory.create({
            modelPath: data.modelPath,
            language: data.language,
            enableWordTimestamps: data.enableWordTimestamps,
            printProgress: false,
            printSpecialTokens: false,
            printRealtime: false,
            printTimestamps: false
        });
        // Transcribe
        const result = await whisper.transcribeFile(data.audioPath);
        // Convert to our format
        const words = [];
        let wordIndex = 0;
        if (result.segments) {
            for (const segment of result.segments) {
                if (segment.words) {
                    for (const word of segment.words) {
                        words.push({
                            id: `w${wordIndex++}`,
                            text: word.word || '',
                            start: word.start || 0,
                            end: word.end || 0,
                            kind: 'word',
                            removed: false,
                            removeReason: null
                        });
                    }
                }
            }
        }
        return { words };
    }
    catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}
worker_threads_1.parentPort?.on('message', async (data) => {
    try {
        const result = await transcribeAudio(data);
        worker_threads_1.parentPort?.postMessage({ success: true, result });
    }
    catch (error) {
        worker_threads_1.parentPort?.postMessage({ success: false, error: error.message });
    }
});
