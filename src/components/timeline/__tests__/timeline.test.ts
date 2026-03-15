import { describe, it, expect, beforeEach } from 'vitest';
import { niceInterval, formatLabel } from '../Timeline';
import { useUiStore, uiStoreActions } from '@/store/uiStore';

describe('Timeline', () => {
  describe('niceInterval', () => {
    it('TestTimeline_NiceInterval_SmallValues', () => {
      expect(niceInterval(0.3)).toBe(0.5);
      expect(niceInterval(0.7)).toBe(1);
      expect(niceInterval(1)).toBe(1);
    });

    it('TestTimeline_NiceInterval_MediumValues', () => {
      expect(niceInterval(3)).toBe(5);
      expect(niceInterval(7)).toBe(10);
      expect(niceInterval(15)).toBe(20);
    });

    it('TestTimeline_NiceInterval_LargeValues', () => {
      expect(niceInterval(67)).toBe(100);
      expect(niceInterval(150)).toBe(200);
      expect(niceInterval(350)).toBe(500);
      expect(niceInterval(800)).toBe(1000);
    });

    it('TestTimeline_NiceInterval_Zero', () => {
      expect(niceInterval(0)).toBe(1);
      expect(niceInterval(-5)).toBe(1);
    });
  });

  describe('formatLabel', () => {
    it('TestTimeline_FormatLabel_Frames', () => {
      expect(formatLabel(0, 'frames', 10)).toBe('0');
      expect(formatLabel(42, 'frames', 10)).toBe('42');
      expect(formatLabel(1000, 'frames', 10)).toBe('1000');
    });

    it('TestTimeline_FormatLabel_Time', () => {
      expect(formatLabel(0, 'time', 10)).toBe('0.0s');
      expect(formatLabel(10, 'time', 10)).toBe('1.0s');
      expect(formatLabel(25, 'time', 10)).toBe('2.5s');
      expect(formatLabel(600, 'time', 10)).toBe('1:00.0');
    });

    it('TestTimeline_FormatLabel_Timecode', () => {
      expect(formatLabel(0, 'timecode', 30)).toBe('0:00:00');
      expect(formatLabel(30, 'timecode', 30)).toBe('0:01:00');
      expect(formatLabel(45, 'timecode', 30)).toBe('0:01:15');
      expect(formatLabel(1830, 'timecode', 30)).toBe('1:01:00');
    });

    it('TestTimeline_FormatLabel_ZeroFps_DefaultsTo60', () => {
      expect(formatLabel(60, 'time', 0)).toBe('1.0s');
      expect(formatLabel(60, 'timecode', 0)).toBe('0:01:00');
    });
  });

  describe('timeline store', () => {
    beforeEach(() => {
      useUiStore.setState({
        timelineDuration: 300,
        timelineZoomStart: 0,
        timelineZoomEnd: 300,
        timelineAutoExtend: true,
      });
    });

    it('TestTimeline_Duration_SetTo300', () => {
      expect(useUiStore.getState().timelineDuration).toBe(300);
    });

    it('TestTimeline_SetDuration_ClampsMinimum', () => {
      uiStoreActions.setTimelineDuration(0);
      expect(useUiStore.getState().timelineDuration).toBe(1);
    });

    it('TestTimeline_SetDuration_AdjustsZoom', () => {
      uiStoreActions.setTimelineZoom(100, 300);
      uiStoreActions.setTimelineDuration(200);
      expect(useUiStore.getState().timelineZoomEnd).toBe(200);
    });

    it('TestTimeline_SetZoom_ClampsToRange', () => {
      uiStoreActions.setTimelineZoom(-50, 400);
      const s = useUiStore.getState();
      expect(s.timelineZoomStart).toBe(0);
      expect(s.timelineZoomEnd).toBe(300);
    });

    it('TestTimeline_SetZoom_EnforcesMinSpan', () => {
      // Try to set a zero-width zoom — should be rejected
      uiStoreActions.setTimelineZoom(100, 100);
      const s = useUiStore.getState();
      // Original zoom should be preserved since e - s < 1
      expect(s.timelineZoomEnd - s.timelineZoomStart).toBeGreaterThanOrEqual(1);
    });
  });
});
