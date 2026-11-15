import { Injectable } from '@angular/core';
import { EDL, ProcessingProgress, DetectionSettings } from './types';

declare global {
  interface Window {
    electronAPI: {
      importVideo: (filePath: string) => Promise<any>;
      generateProxy: (sourceId: string) => Promise<string>;
      extractAudio: (sourceId: string) => Promise<string>;
      transcribe: (audioPath: string, settings: any) => Promise<any>;
      detectSilence: (audioPath: string, settings: DetectionSettings) => Promise<any>;
      detectFillers: (transcript: any[], fillerWords: string[]) => Promise<any>;
      exportVideo: (edl: EDL, outputPath: string, format: string) => Promise<void>;
      onProgress: (callback: (progress: ProcessingProgress) => void) => void;
      openFileDialog: () => Promise<string[]>;
      selectFolder: () => Promise<string>;
      setProjectPath: (projectPath: string) => Promise<void>;
      getCaptionStyles: () => Promise<string[]>;
      generateCaptions: (words: any[], styleName: string) => Promise<string>;
      getBrandTemplates: () => Promise<any[]>;
      saveBrandTemplate: (template: any) => Promise<void>;
      deleteBrandTemplate: (templateId: string) => Promise<void>;
      batchExport: (edl: any, formats: string[]) => Promise<any[]>;
      extractReels: (transcript: any[], minDuration: number, maxDuration: number) => Promise<any[]>;
      saveProject: (folderPath: string, projectData: any) => Promise<boolean>;
      loadProject: (folderPath: string) => Promise<any>;
      hasProject: (folderPath: string) => Promise<boolean>;
      openFolder: (folderPath: string) => Promise<void>;
      deleteProject: (folderPath: string) => Promise<boolean>;
      enhanceAudio: (audioPath: string, options?: any) => Promise<{ success: boolean; outputPath: string }>;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class IpcService {
  constructor() {
    if (!window.electronAPI) {
      console.error('Electron API not available');
    }
  }

  async importVideo(filePath: string): Promise<any> {
    return window.electronAPI?.importVideo(filePath);
  }

  async generateProxy(sourceId: string): Promise<string> {
    return window.electronAPI?.generateProxy(sourceId);
  }

  async extractAudio(sourceId: string): Promise<string> {
    return window.electronAPI?.extractAudio(sourceId);
  }

  async transcribe(audioPath: string, settings: any): Promise<any> {
    return window.electronAPI?.transcribe(audioPath, settings);
  }

  async detectSilence(audioPath: string, settings: DetectionSettings): Promise<any> {
    return window.electronAPI?.detectSilence(audioPath, settings);
  }

  async detectFillers(transcript: any[], fillerWords: string[]): Promise<any> {
    return window.electronAPI?.detectFillers(transcript, fillerWords);
  }

  async exportVideo(edl: EDL, outputPath: string, format: string): Promise<void> {
    return window.electronAPI?.exportVideo(edl, outputPath, format);
  }

  onProgress(callback: (progress: ProcessingProgress) => void): void {
    window.electronAPI?.onProgress(callback);
  }

  async openFileDialog(): Promise<string[]> {
    return window.electronAPI?.openFileDialog() || [];
  }

  async selectFolder(): Promise<string> {
    return window.electronAPI?.selectFolder() || '';
  }

  async setProjectPath(projectPath: string): Promise<void> {
    return window.electronAPI?.setProjectPath(projectPath);
  }

  async getCaptionStyles(): Promise<string[]> {
    return window.electronAPI?.getCaptionStyles() || [];
  }

  async generateCaptions(words: any[], styleName: string): Promise<string> {
    return window.electronAPI?.generateCaptions(words, styleName);
  }

  async getBrandTemplates(): Promise<any[]> {
    return window.electronAPI?.getBrandTemplates() || [];
  }

  async saveBrandTemplate(template: any): Promise<void> {
    return window.electronAPI?.saveBrandTemplate(template);
  }

  async deleteBrandTemplate(templateId: string): Promise<void> {
    return window.electronAPI?.deleteBrandTemplate(templateId);
  }

  async batchExport(edl: any, formats: string[]): Promise<any[]> {
    return window.electronAPI?.batchExport(edl, formats);
  }

  async extractReels(transcript: any[], minDuration: number, maxDuration: number): Promise<any[]> {
    return window.electronAPI?.extractReels(transcript, minDuration, maxDuration);
  }

  async saveProject(folderPath: string, projectData: any): Promise<boolean> {
    return window.electronAPI?.saveProject(folderPath, projectData);
  }

  async loadProject(folderPath: string): Promise<any> {
    return window.electronAPI?.loadProject(folderPath);
  }

  async hasProject(folderPath: string): Promise<boolean> {
    return window.electronAPI?.hasProject(folderPath);
  }

  async openFolder(folderPath: string): Promise<void> {
    return window.electronAPI?.openFolder(folderPath);
  }

  async deleteProject(folderPath: string): Promise<boolean> {
    return window.electronAPI?.deleteProject(folderPath);
  }

  async enhanceAudio(audioPath: string, options?: any): Promise<{ success: boolean; outputPath: string }> {
    return window.electronAPI?.enhanceAudio(audioPath, options);
  }
}
