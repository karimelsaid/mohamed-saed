import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineStore } from './timeline.store';
import { SnappingService } from './snapping.service';
import {
  TimelineCommandService,
  SplitSegmentCommand,
  TrimSegmentCommand,
  DeleteSegmentCommand,
  RippleDeleteSegmentCommand
} from './timeline-commands';
import { Segment, EDL } from '../../core/types';

describe('Timeline Core Engine & Math', () => {
  let store: TimelineStore;

  beforeEach(() => {
    store = new TimelineStore();
    store.zoom.set(100); // 100px per second
  });

  describe('Time <-> Pixel Conversion', () => {
    it('should correctly convert seconds to pixels', () => {
      expect(store.timeToPixel(0)).toBe(0);
      expect(store.timeToPixel(2.5)).toBe(250);
      expect(store.timeToPixel(10)).toBe(1000);
    });

    it('should correctly convert pixels to seconds', () => {
      expect(store.pixelToTime(0)).toBe(0);
      expect(store.pixelToTime(250)).toBe(2.5);
      expect(store.pixelToTime(1000)).toBe(10);
    });

    it('should format timecode accurately to mm:ss:ff at 30fps', () => {
      expect(store.formatTimecode(0)).toBe('00:00:00');
      expect(store.formatTimecode(65.5)).toBe('01:05:15');
      expect(store.formatTimecode(125.0)).toBe('02:05:00');
    });
  });

  describe('Snapping Service Math', () => {
    let mockEdlService: any;
    let snappingService: SnappingService;

    beforeEach(() => {
      mockEdlService = {
        getEdl: () => ({
          segments: [
            { id: 's1', camera: 'cam1', srcStart: 1.0, srcEnd: 5.0, zoom: 1.0 },
            { id: 's2', camera: 'cam1', srcStart: 6.0, srcEnd: 10.0, zoom: 1.0 }
          ],
          transcript: []
        })
      };
      snappingService = new SnappingService(store, mockEdlService);
      store.snappingEnabled.set(true);
      store.playheadTime.set(3.0);
    });

    it('should snap to nearby segment boundary within threshold', () => {
      // 100px/s zoom, SNAP_THRESHOLD_PX = 8px => threshold is 0.08s
      // Candidate: srcStart = 5.0s. Test at 5.05s
      const result = snappingService.findSnapPoint(5.05);
      expect(result.snapped).toBe(true);
      expect(result.time).toBe(5.0);
      expect(result.guidePixel).toBe(500);
    });

    it('should snap to playhead if close', () => {
      // Playhead is at 3.0s
      const result = snappingService.findSnapPoint(3.04);
      expect(result.snapped).toBe(true);
      expect(result.time).toBe(3.0);
    });

    it('should not snap if distance exceeds threshold', () => {
      const result = snappingService.findSnapPoint(7.5);
      expect(result.snapped).toBe(false);
      expect(result.time).toBe(7.5);
      expect(result.guidePixel).toBeNull();
    });
  });

  describe('Timeline Commands & Undo / Redo', () => {
    let mockEdl: EDL;
    let mockEdlService: any;
    let mockProjectService: any;
    let cmdService: TimelineCommandService;

    beforeEach(() => {
      mockEdl = {
        version: 1,
        sources: [{ id: 'cam1', path: 'test.mp4', offsetSec: 0, isMainAudio: true }],
        transcript: [],
        segments: [
          { id: 's1', camera: 'cam1', srcStart: 0, srcEnd: 10, zoom: 1.0 }
        ],
        captions: { template: 'classic', enabled: true },
        export: { formats: ['16:9'] }
      };

      mockEdlService = {
        getEdl: () => mockEdl,
        setEdl: (newEdl: EDL) => { mockEdl = newEdl; }
      };

      mockProjectService = {
        saveProject: () => Promise.resolve()
      };

      cmdService = new TimelineCommandService(mockEdlService, mockProjectService);
    });

    it('should execute SplitSegmentCommand and undo/redo it', () => {
      const splitCmd = new SplitSegmentCommand(mockEdlService, 's1', 4.0);
      cmdService.execute(splitCmd);

      expect(mockEdl.segments.length).toBe(2);
      expect(mockEdl.segments[0].srcEnd).toBe(4.0);
      expect(mockEdl.segments[1].srcStart).toBe(4.0);
      expect(mockEdl.segments[1].srcEnd).toBe(10);
      expect(cmdService.canUndo()).toBe(true);

      // Undo
      cmdService.undo();
      expect(mockEdl.segments.length).toBe(1);
      expect(mockEdl.segments[0].srcEnd).toBe(10);
      expect(cmdService.canRedo()).toBe(true);

      // Redo
      cmdService.redo();
      expect(mockEdl.segments.length).toBe(2);
      expect(mockEdl.segments[0].srcEnd).toBe(4.0);
    });

    it('should execute TrimSegmentCommand and undo/redo it', () => {
      const trimCmd = new TrimSegmentCommand(mockEdlService, 's1', 0, 10, 2.0, 8.0);
      cmdService.execute(trimCmd);

      expect(mockEdl.segments[0].srcStart).toBe(2.0);
      expect(mockEdl.segments[0].srcEnd).toBe(8.0);

      // Undo
      cmdService.undo();
      expect(mockEdl.segments[0].srcStart).toBe(0);
      expect(mockEdl.segments[0].srcEnd).toBe(10);

      // Redo
      cmdService.redo();
      expect(mockEdl.segments[0].srcStart).toBe(2.0);
      expect(mockEdl.segments[0].srcEnd).toBe(8.0);
    });

    it('should execute RippleDeleteSegmentCommand and shift subsequent segments', () => {
      mockEdl.segments = [
        { id: 's1', camera: 'cam1', srcStart: 0, srcEnd: 4, zoom: 1.0 },
        { id: 's2', camera: 'cam1', srcStart: 4, srcEnd: 7, zoom: 1.0 },
        { id: 's3', camera: 'cam1', srcStart: 7, srcEnd: 10, zoom: 1.0 }
      ];

      const rippleCmd = new RippleDeleteSegmentCommand(mockEdlService, 's2');
      cmdService.execute(rippleCmd);

      expect(mockEdl.segments.length).toBe(2);
      expect(mockEdl.segments.find(s => s.id === 's2')).toBeUndefined();

      const s3 = mockEdl.segments.find(s => s.id === 's3')!;
      expect(s3.srcStart).toBe(4);
      expect(s3.srcEnd).toBe(7);

      // Undo
      cmdService.undo();
      expect(mockEdl.segments.length).toBe(3);
      expect(mockEdl.segments[1].id).toBe('s2');
      expect(mockEdl.segments[2].srcStart).toBe(7);
      expect(mockEdl.segments[2].srcEnd).toBe(10);
    });
  });
});
