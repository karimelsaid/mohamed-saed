import { Injectable } from '@angular/core';
import { EDL } from './types';
import { IpcService } from './ipc.service';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private projectPath: string | null = null;

  constructor(private ipcService: IpcService) {}

  async createProject(folderPath: string): Promise<void> {
    this.projectPath = folderPath;
    await this.ipcService.setProjectPath(folderPath);
  }

  async hasProject(folderPath: string): Promise<boolean> {
    try {
      return await this.ipcService.hasProject(folderPath);
    } catch {
      return false;
    }
  }

  async loadProject(folderPath: string): Promise<EDL> {
    this.projectPath = folderPath;
    try {
      const data = await this.ipcService.loadProject(folderPath);
      if (data) {
        // Also update local storage backup
        localStorage.setItem('kemi_active_project_backup', JSON.stringify({ folderPath, edl: data }));
        return data as EDL;
      }
    } catch (e) {
      console.warn('IPC loadProject failed, checking localStorage backup', e);
    }

    // Fallback: check localStorage
    const local = localStorage.getItem('kemi_active_project_backup');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed.folderPath === folderPath && parsed.edl) {
          return parsed.edl as EDL;
        }
      } catch {}
    }

    throw new Error(`لا يوجد ملف مشروع محفوظ في: ${folderPath}`);
  }

  async saveProject(edl: EDL): Promise<void> {
    const targetPath = this.projectPath;
    if (!targetPath) {
      console.warn('No projectPath set, saving only to local backup');
      localStorage.setItem('kemi_active_project_backup', JSON.stringify({ folderPath: 'untitled', edl }));
      return;
    }

    try {
      // 1. Save to project.json via Electron
      await this.ipcService.saveProject(targetPath, edl);
    } catch (err) {
      console.error('Failed to save project file via IPC:', err);
    }

    // 2. Always maintain high-speed browser localStorage backup
    try {
      localStorage.setItem('kemi_active_project_backup', JSON.stringify({ folderPath: targetPath, edl }));
    } catch {}
  }

  setProjectPath(folderPath: string | null): void {
    this.projectPath = folderPath;
  }

  getProjectPath(): string | null {
    return this.projectPath;
  }

  async createProxyFolder(): Promise<string> {
    if (!this.projectPath) throw new Error('No project loaded');
    return `${this.projectPath}/proxies`;
  }
}
