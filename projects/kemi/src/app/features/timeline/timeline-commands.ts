import { Injectable, signal } from '@angular/core';
import { EdlService } from '../../core/edl.service';
import { ProjectService } from '../../core/project.service';
import { Segment, TranscriptWord } from '../../core/types';

export interface TimelineCommand {
  name: string;
  execute(): void;
  undo(): void;
  redo?(): void;
}

@Injectable({ providedIn: 'root' })
export class TimelineCommandService {
  private undoStack: TimelineCommand[] = [];
  private redoStack: TimelineCommand[] = [];

  canUndo = signal<boolean>(false);
  canRedo = signal<boolean>(false);
  lastActionName = signal<string>('');

  constructor(
    private edlService: EdlService,
    private projectService: ProjectService
  ) {}

  execute(command: TimelineCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack on new action
    this.updateSignals(command.name);
    this.saveProjectState();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.updateSignals(`تراجع عن: ${command.name}`);
      this.saveProjectState();
    }
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (command) {
      if (command.redo) {
        command.redo();
      } else {
        command.execute();
      }
      this.undoStack.push(command);
      this.updateSignals(`إعادة: ${command.name}`);
      this.saveProjectState();
    }
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateSignals('');
  }

  private updateSignals(lastAction: string): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.lastActionName.set(lastAction);
  }

  private saveProjectState(): void {
    const edl = this.edlService.getEdl();
    if (edl) {
      this.projectService.saveProject(edl).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// COMMANDS IMPLEMENTATION
// ---------------------------------------------------------------------------

export class SplitSegmentCommand implements TimelineCommand {
  name = 'تقسيم المقطع';
  private originalSegment: Segment | null = null;
  private newSegmentId1 = '';
  private newSegmentId2 = '';

  constructor(
    private edlService: EdlService,
    private segmentId: string,
    private splitTime: number
  ) {}

  execute(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;

    const idx = edl.segments.findIndex(s => s.id === this.segmentId);
    if (idx === -1) return;

    const seg = edl.segments[idx];
    if (this.splitTime <= seg.srcStart || this.splitTime >= seg.srcEnd) return;

    this.originalSegment = { ...seg };
    this.newSegmentId1 = seg.id;
    this.newSegmentId2 = `s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const seg1: Segment = {
      ...seg,
      id: this.newSegmentId1,
      srcEnd: Number(this.splitTime.toFixed(3))
    };

    const seg2: Segment = {
      ...seg,
      id: this.newSegmentId2,
      srcStart: Number(this.splitTime.toFixed(3))
    };

    edl.segments.splice(idx, 1, seg1, seg2);
    this.edlService.setEdl({ ...edl });
  }

  undo(): void {
    const edl = this.edlService.getEdl();
    if (!edl || !this.originalSegment) return;

    const idx = edl.segments.findIndex(s => s.id === this.newSegmentId1);
    if (idx !== -1 && edl.segments[idx + 1]?.id === this.newSegmentId2) {
      edl.segments.splice(idx, 2, { ...this.originalSegment });
      this.edlService.setEdl({ ...edl });
    }
  }
}

export class TrimSegmentCommand implements TimelineCommand {
  name = 'قص طرف المقطع';

  constructor(
    private edlService: EdlService,
    private segmentId: string,
    private oldStart: number,
    private oldEnd: number,
    private newStart: number,
    private newEnd: number
  ) {}

  execute(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    const seg = edl.segments.find(s => s.id === this.segmentId);
    if (seg) {
      seg.srcStart = Number(this.newStart.toFixed(3));
      seg.srcEnd = Number(this.newEnd.toFixed(3));
      this.edlService.setEdl({ ...edl });
    }
  }

  undo(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    const seg = edl.segments.find(s => s.id === this.segmentId);
    if (seg) {
      seg.srcStart = Number(this.oldStart.toFixed(3));
      seg.srcEnd = Number(this.oldEnd.toFixed(3));
      this.edlService.setEdl({ ...edl });
    }
  }
}

export class DeleteSegmentCommand implements TimelineCommand {
  name = 'حذف المقطع';
  private deletedSegment: Segment | null = null;
  private originalIndex = -1;

  constructor(
    private edlService: EdlService,
    private segmentId: string
  ) {}

  execute(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    const idx = edl.segments.findIndex(s => s.id === this.segmentId);
    if (idx !== -1) {
      this.originalIndex = idx;
      this.deletedSegment = { ...edl.segments[idx] };
      edl.segments.splice(idx, 1);
      this.edlService.setEdl({ ...edl });
    }
  }

  undo(): void {
    const edl = this.edlService.getEdl();
    if (!edl || !this.deletedSegment || this.originalIndex === -1) return;
    edl.segments.splice(this.originalIndex, 0, { ...this.deletedSegment });
    this.edlService.setEdl({ ...edl });
  }
}

export class RippleDeleteSegmentCommand implements TimelineCommand {
  name = 'حذف المقطع مع إغلاق الفراغ (Ripple)';
  private oldSegments: Segment[] = [];

  constructor(
    private edlService: EdlService,
    private segmentId: string
  ) {}

  execute(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    this.oldSegments = edl.segments.map(s => ({ ...s }));

    const idx = edl.segments.findIndex(s => s.id === this.segmentId);
    if (idx !== -1) {
      const deleted = edl.segments[idx];
      const gap = deleted.srcEnd - deleted.srcStart;
      edl.segments.splice(idx, 1);
      for (let i = idx; i < edl.segments.length; i++) {
        edl.segments[i].srcStart = Number((edl.segments[i].srcStart - gap).toFixed(3));
        edl.segments[i].srcEnd = Number((edl.segments[i].srcEnd - gap).toFixed(3));
      }
      this.edlService.setEdl({ ...edl });
    }
  }

  undo(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    edl.segments = this.oldSegments.map(s => ({ ...s }));
    this.edlService.setEdl({ ...edl });
  }
}

export class SwitchCameraCommand implements TimelineCommand {
  name = 'تبديل الكاميرا';

  constructor(
    private edlService: EdlService,
    private segmentId: string,
    private newCamera: string,
    private oldCamera: string
  ) {}

  execute(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    const seg = edl.segments.find(s => s.id === this.segmentId);
    if (seg) {
      seg.camera = this.newCamera;
      const vCam = this.edlService.getVirtualCameraById(this.newCamera);
      if (vCam) {
        seg.zoom = vCam.zoom;
      }
      this.edlService.setEdl({ ...edl });
    }
  }

  undo(): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    const seg = edl.segments.find(s => s.id === this.segmentId);
    if (seg) {
      seg.camera = this.oldCamera;
      const vCam = this.edlService.getVirtualCameraById(this.oldCamera);
      if (vCam) {
        seg.zoom = vCam.zoom;
      }
      this.edlService.setEdl({ ...edl });
    }
  }
}

export class ToggleWordRemovalCommand implements TimelineCommand {
  name = 'تعديل حذف كلمة';

  constructor(
    private edlService: EdlService,
    private wordId: string,
    private newRemoved: boolean,
    private oldRemoved: boolean = !newRemoved
  ) {}

  execute(): void {
    this.edlService.updateWordRemoval(this.wordId, this.newRemoved, this.newRemoved ? 'manual' : null);
  }

  undo(): void {
    this.edlService.updateWordRemoval(this.wordId, this.oldRemoved, this.oldRemoved ? 'manual' : null);
  }
}

export class EditCaptionCommand implements TimelineCommand {
  name = 'تعديل نص الترجمة';

  constructor(
    private edlService: EdlService,
    private wordId: string,
    private newText: string,
    private oldText: string
  ) {}

  execute(): void {
    this.edlService.updateWordText(this.wordId, this.newText);
  }

  undo(): void {
    this.edlService.updateWordText(this.wordId, this.oldText);
  }
}
