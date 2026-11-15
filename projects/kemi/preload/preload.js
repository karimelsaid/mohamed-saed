"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('Preload script loaded!');
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    importVideo: (filePath) => electron_1.ipcRenderer.invoke('import-video', filePath),
    generateProxy: (sourceId) => electron_1.ipcRenderer.invoke('generate-proxy', sourceId),
    extractAudio: (sourceId) => electron_1.ipcRenderer.invoke('extract-audio', sourceId),
    transcribe: (audioPath, settings) => electron_1.ipcRenderer.invoke('transcribe', audioPath, settings),
    detectSilence: (audioPath, settings) => electron_1.ipcRenderer.invoke('detect-silence', audioPath, settings),
    detectFillers: (transcript, fillerWords) => electron_1.ipcRenderer.invoke('detect-fillers', transcript, fillerWords),
    exportVideo: (edl, outputPath, format) => electron_1.ipcRenderer.invoke('export-video', edl, outputPath, format),
    onProgress: (callback) => {
        electron_1.ipcRenderer.on('processing-progress', (_event, progress) => callback(progress));
    },
    openFileDialog: () => electron_1.ipcRenderer.invoke('open-file-dialog'),
    selectFolder: () => electron_1.ipcRenderer.invoke('select-folder'),
    setProjectPath: (projectPath) => electron_1.ipcRenderer.invoke('set-project-path', projectPath),
    getCaptionStyles: () => electron_1.ipcRenderer.invoke('get-caption-styles'),
    generateCaptions: (words, styleName) => electron_1.ipcRenderer.invoke('generate-captions', words, styleName),
    getBrandTemplates: () => electron_1.ipcRenderer.invoke('get-brand-templates'),
    saveBrandTemplate: (template) => electron_1.ipcRenderer.invoke('save-brand-template', template),
    deleteBrandTemplate: (templateId) => electron_1.ipcRenderer.invoke('delete-brand-template', templateId),
    batchExport: (edl, formats) => electron_1.ipcRenderer.invoke('batch-export', edl, formats),
    extractReels: (transcript, minDuration, maxDuration) => electron_1.ipcRenderer.invoke('extract-reels', transcript, minDuration, maxDuration),
    openFolder: (folderPath) => electron_1.ipcRenderer.invoke('open-folder', folderPath)
});
console.log('electronAPI exposed to window');
