import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loaded!');

contextBridge.exposeInMainWorld('electronAPI', {
  importVideo: (filePath: string) => ipcRenderer.invoke('import-video', filePath),
  generateProxy: (sourceId: string) => ipcRenderer.invoke('generate-proxy', sourceId),
  extractAudio: (sourceId: string) => ipcRenderer.invoke('extract-audio', sourceId),
  transcribe: (audioPath: string, settings: any) => ipcRenderer.invoke('transcribe', audioPath, settings),
  detectSilence: (audioPath: string, settings: any) => ipcRenderer.invoke('detect-silence', audioPath, settings),
  detectFillers: (transcript: any[], fillerWords: string[]) => ipcRenderer.invoke('detect-fillers', transcript, fillerWords),
  exportVideo: (edl: any, outputPath: string, format: string) => ipcRenderer.invoke('export-video', edl, outputPath, format),
  onProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('processing-progress', (_event, progress) => callback(progress));
  },
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  setProjectPath: (projectPath: string) => ipcRenderer.invoke('set-project-path', projectPath),
  getCaptionStyles: () => ipcRenderer.invoke('get-caption-styles'),
  generateCaptions: (words: any[], styleName: string) => ipcRenderer.invoke('generate-captions', words, styleName),
  getBrandTemplates: () => ipcRenderer.invoke('get-brand-templates'),
  saveBrandTemplate: (template: any) => ipcRenderer.invoke('save-brand-template', template),
  deleteBrandTemplate: (templateId: string) => ipcRenderer.invoke('delete-brand-template', templateId),
  batchExport: (edl: any, formats: string[]) => ipcRenderer.invoke('batch-export', edl, formats),
  extractReels: (transcript: any[], minDuration: number, maxDuration: number) => ipcRenderer.invoke('extract-reels', transcript, minDuration, maxDuration),
  saveProject: (folderPath: string, projectData: any) => ipcRenderer.invoke('save-project', folderPath, projectData),
  loadProject: (folderPath: string) => ipcRenderer.invoke('load-project', folderPath),
  hasProject: (folderPath: string) => ipcRenderer.invoke('has-project', folderPath),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
  deleteProject: (folderPath: string) => ipcRenderer.invoke('delete-project', folderPath),
  enhanceAudio: (audioPath: string, options?: any) => ipcRenderer.invoke('enhance-audio', audioPath, options),

  // AI Multi-Camera
  generateMulticamViews: (options: any) => ipcRenderer.invoke('generate-multicam-views', options),
  cancelMulticam: () => ipcRenderer.invoke('cancel-multicam'),
  getMulticamOutputs: (outputDir: string) => ipcRenderer.invoke('get-multicam-outputs', outputDir),
  onMulticamProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('multicam-progress', (_event, progress) => callback(progress));
  }
} as any);

console.log('electronAPI exposed to window');
