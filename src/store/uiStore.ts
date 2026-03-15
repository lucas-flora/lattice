/**
 * UI state store.
 *
 * Manages timeline, playback, brush, and grid line state.
 * Panel visibility/mode/sizing state has been migrated to layoutStore.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type TimelineDisplayMode = 'frames' | 'time' | 'timecode';
export type PlaybackMode = 'loop' | 'endless' | 'once';

export interface UiState {
  /** Whether the hotkey help overlay is visible */
  isHotkeyHelpOpen: boolean;
  /** Current brush size for drawing (1, 3, 5, 7) */
  brushSize: number;
  /** Whether grid lines are displayed */
  gridLinesVisible: boolean;
  /** Timeline display format */
  timelineDisplayMode: TimelineDisplayMode;
  /** Timeline total duration in frames */
  timelineDuration: number;
  /** Zoom view start frame */
  timelineZoomStart: number;
  /** Zoom view end frame */
  timelineZoomEnd: number;
  /** Auto-extend timeline when sim reaches the end */
  timelineAutoExtend: boolean;
  /** Playback end-of-timeline behavior */
  playbackMode: PlaybackMode;
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((): UiState => ({
    isHotkeyHelpOpen: false,
    brushSize: 1,
    gridLinesVisible: false,
    timelineDisplayMode: 'frames' as TimelineDisplayMode,
    timelineDuration: 256,
    timelineZoomStart: 0,
    timelineZoomEnd: 256,
    timelineAutoExtend: true,
    playbackMode: 'loop' as PlaybackMode,
  })),
);

/** Store actions -- called from wireStores event handlers */
export const uiStoreActions = {
  updateUi: (partial: Partial<UiState>): void => {
    useUiStore.setState(partial);
  },
  setBrushSize: (brushSize: number): void => {
    useUiStore.setState({ brushSize });
  },
  toggleGridLines: (): void => {
    useUiStore.setState((s) => ({ gridLinesVisible: !s.gridLinesVisible }));
  },
  setGridLines: (visible: boolean): void => {
    useUiStore.setState({ gridLinesVisible: visible });
  },
  setTimelineDuration: (duration: number): void => {
    const d = Math.max(1, Math.round(duration));
    useUiStore.setState((s) => ({
      timelineDuration: d,
      timelineZoomEnd: Math.min(s.timelineZoomEnd, d),
      timelineZoomStart: Math.min(s.timelineZoomStart, d - 1),
    }));
  },
  setTimelineZoom: (start: number, end: number): void => {
    const { timelineDuration } = useUiStore.getState();
    const s = Math.max(0, Math.round(start));
    const e = Math.min(timelineDuration, Math.round(end));
    if (e - s >= 1) {
      useUiStore.setState({ timelineZoomStart: s, timelineZoomEnd: e });
    }
  },
  setTimelineAutoExtend: (autoExtend: boolean): void => {
    useUiStore.setState({ timelineAutoExtend: autoExtend });
  },
  setPlaybackMode: (playbackMode: PlaybackMode): void => {
    useUiStore.setState({ playbackMode });
  },
};
