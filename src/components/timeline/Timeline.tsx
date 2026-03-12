/**
 * Timeline: Premiere-style full-width timeline with mini-map and zoomed ruler.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ ▐═══[====]════════════════════════════════════▐  │ Mini-map (full extent)
 * ├──────────────────────────────────────────────────┤
 * │ ▼  50    60    70    80   ...                    │ Main ruler (zoomed view)
 * └──────────────────────────────────────────────────┘
 *
 * Frame counter is exported separately for placement below the timeline.
 *
 * Features:
 * - Mini-map always shows 0..timelineDuration, highlights zoom region with grips
 * - Main ruler shows zoomed portion with adaptive ticks
 * - Thin playhead line with triangle marker
 * - Click-to-seek, drag-to-scrub, scroll-to-zoom
 * - Auto-extend: when sim reaches end, doubles duration
 * - Display modes: frames / time / timecode (click label to cycle)
 */

'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useSimStore } from '@/store/simStore';
import { useUiStore, uiStoreActions } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';

export type TimelineDisplayMode = 'frames' | 'time' | 'timecode';

/**
 * Round to a "nice" interval for tick marks (1, 2, 5, 10, 20, 50, 100, ...).
 */
function niceInterval(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  if (residual <= 1) return magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function formatLabel(frame: number, mode: TimelineDisplayMode, fps: number): string {
  const effectiveFps = fps || 60;
  switch (mode) {
    case 'time': {
      const seconds = frame / effectiveFps;
      if (seconds < 60) return `${seconds.toFixed(1)}s`;
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toFixed(1);
      return `${mins}:${secs.padStart(4, '0')}`;
    }
    case 'timecode': {
      const totalSeconds = Math.floor(frame / effectiveFps);
      const remainingFrames = Math.round(frame % effectiveFps);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}:${String(remainingFrames).padStart(2, '0')}`;
    }
    default:
      return String(frame);
  }
}

export { niceInterval, formatLabel };

const MINIMAP_HEIGHT = 12;
const RULER_HEIGHT = 24;
const MAJOR_TICK_HEIGHT = 10;
const MINOR_TICK_HEIGHT = 5;

// ─── Mini-map ────────────────────────────────────────────────

function MiniMap({
  containerWidth,
  duration,
  computedFrames,
  generation,
  zoomStart,
  zoomEnd,
  onSeek,
}: {
  containerWidth: number;
  duration: number;
  computedFrames: number;
  generation: number;
  zoomStart: number;
  zoomEnd: number;
  onSeek: (frame: number) => void;
}) {
  const draggingRef = useRef<'none' | 'pan' | 'left' | 'right'>('none');
  const dragStartRef = useRef({ x: 0, zoomStart: 0, zoomEnd: 0 });

  const frameToX = (frame: number) => (frame / Math.max(duration, 1)) * containerWidth;
  const xToFrame = (x: number) => (x / Math.max(containerWidth, 1)) * duration;

  const computedWidth = frameToX(Math.min(computedFrames, duration));
  const zoomLeftX = frameToX(zoomStart);
  const zoomWidth = frameToX(zoomEnd) - zoomLeftX;
  const playheadX = frameToX(Math.min(generation, duration));

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    el.setPointerCapture(e.pointerId);

    // Check if clicking on zoom region edges (8px grab zone for grips)
    if (Math.abs(x - zoomLeftX) < 8) {
      draggingRef.current = 'left';
      dragStartRef.current = { x: e.clientX, zoomStart, zoomEnd };
    } else if (Math.abs(x - (zoomLeftX + zoomWidth)) < 8) {
      draggingRef.current = 'right';
      dragStartRef.current = { x: e.clientX, zoomStart, zoomEnd };
    } else if (x >= zoomLeftX && x <= zoomLeftX + zoomWidth) {
      // Inside zoom region — pan
      draggingRef.current = 'pan';
      dragStartRef.current = { x: e.clientX, zoomStart, zoomEnd };
    } else {
      // Outside — seek + recenter zoom
      const frame = Math.round(xToFrame(x));
      onSeek(frame);
      // Recenter zoom on click position
      const zoomSpan = zoomEnd - zoomStart;
      const newStart = Math.max(0, Math.min(frame - zoomSpan / 2, duration - zoomSpan));
      uiStoreActions.setTimelineZoom(newStart, newStart + zoomSpan);
    }
  }, [zoomLeftX, zoomWidth, zoomStart, zoomEnd, duration, xToFrame, onSeek]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingRef.current === 'none') return;
    const dx = e.clientX - dragStartRef.current.x;
    const dFrames = xToFrame(dx);
    const { zoomStart: origStart, zoomEnd: origEnd } = dragStartRef.current;
    const span = origEnd - origStart;

    if (draggingRef.current === 'pan') {
      let newStart = origStart + dFrames;
      newStart = Math.max(0, Math.min(newStart, duration - span));
      uiStoreActions.setTimelineZoom(newStart, newStart + span);
    } else if (draggingRef.current === 'left') {
      const newStart = Math.max(0, Math.min(origStart + dFrames, origEnd - 10));
      uiStoreActions.setTimelineZoom(newStart, origEnd);
    } else if (draggingRef.current === 'right') {
      const newEnd = Math.min(duration, Math.max(origStart + 10, origEnd + dFrames));
      uiStoreActions.setTimelineZoom(origStart, newEnd);
    }
  }, [duration, xToFrame]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = 'none';
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ height: MINIMAP_HEIGHT }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      data-testid="timeline-minimap"
    >
      {/* Background — dark outside zoom region */}
      <div className="absolute inset-0 bg-zinc-950" />

      {/* Computed region — subtle green tint in the dark area */}
      <div
        className="absolute top-0 bottom-0 bg-green-500/10"
        style={{ left: 0, width: computedWidth }}
      />

      {/* Zoom region — much brighter to contrast with dark outside */}
      <div
        className="absolute top-0 bottom-0 bg-zinc-700"
        style={{ left: zoomLeftX, width: Math.max(zoomWidth, 2) }}
      />

      {/* Computed region inside zoom — brighter green */}
      {computedWidth > zoomLeftX && (
        <div
          className="absolute top-0 bottom-0 bg-green-500/25"
          style={{
            left: zoomLeftX,
            width: Math.min(computedWidth, zoomLeftX + zoomWidth) - zoomLeftX,
          }}
        />
      )}

      {/* Left grip */}
      <div
        className="absolute top-0 bottom-0 cursor-ew-resize"
        style={{ left: zoomLeftX - 3, width: 6 }}
      >
        <div className="absolute inset-y-0 left-[2px] w-[2px] bg-zinc-400" />
      </div>

      {/* Right grip */}
      <div
        className="absolute top-0 bottom-0 cursor-ew-resize"
        style={{ left: zoomLeftX + zoomWidth - 3, width: 6 }}
      >
        <div className="absolute inset-y-0 right-[2px] w-[2px] bg-zinc-400" />
      </div>

      {/* Playhead on mini-map */}
      <div
        className="absolute top-0 bottom-0 w-px bg-green-400 pointer-events-none"
        style={{ left: playheadX }}
      />
    </div>
  );
}

// ─── Frame Counter (exported for placement in ControlBar row) ─

export function TimelineCounter() {
  const generation = useSimStore((s) => s.generation);
  const speed = useSimStore((s) => s.speed);
  const displayMode = useUiStore((s) => s.timelineDisplayMode);
  const duration = useUiStore((s) => s.timelineDuration);

  const cycleDisplayMode = useCallback(() => {
    const modes: TimelineDisplayMode[] = ['frames', 'time', 'timecode'];
    const currentIdx = modes.indexOf(displayMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    useUiStore.setState({ timelineDisplayMode: nextMode });
  }, [displayMode]);

  const currentLabel = formatLabel(generation, displayMode, speed);
  const durationLabel = formatLabel(duration, displayMode, speed);

  return (
    <button
      onClick={cycleDisplayMode}
      className="shrink-0 py-1 text-[10px] font-mono tabular-nums text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap bg-zinc-800/60 rounded border border-zinc-700/50 text-center"
      style={{ width: 90 }}
      title={`Display: ${displayMode} (click to cycle)`}
      data-testid="timeline-display-mode"
    >
      {currentLabel} / {durationLabel}
    </button>
  );
}

// ─── Main Ruler ──────────────────────────────────────────────

export function Timeline() {
  const generation = useSimStore((s) => s.generation);
  const maxGeneration = useSimStore((s) => s.maxGeneration);
  const computedGeneration = useSimStore((s) => s.computedGeneration);
  const speed = useSimStore((s) => s.speed);
  const isRunning = useSimStore((s) => s.isRunning);
  const displayMode = useUiStore((s) => s.timelineDisplayMode);
  const duration = useUiStore((s) => s.timelineDuration);
  const zoomStart = useUiStore((s) => s.timelineZoomStart);
  const zoomEnd = useUiStore((s) => s.timelineZoomEnd);
  const autoExtend = useUiStore((s) => s.timelineAutoExtend);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const draggingRef = useRef(false);
  const seekRafRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  // Track container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-extend: when generation reaches duration, double it
  useEffect(() => {
    if (!autoExtend) return;
    if (generation >= duration) {
      const newDuration = duration * 2;
      uiStoreActions.setTimelineDuration(newDuration);
      // Keep zoom showing same span but recentered so playhead is at midpoint
      const zoomSpan = zoomEnd - zoomStart;
      const newZoomStart = Math.max(0, generation - zoomSpan / 2);
      uiStoreActions.setTimelineZoom(newZoomStart, newZoomStart + zoomSpan);
    }
  }, [generation, duration, autoExtend, zoomStart, zoomEnd]);

  // Zoomed view range
  const zoomSpan = Math.max(zoomEnd - zoomStart, 1);
  const pixelsPerFrame = containerWidth / zoomSpan;

  // Tick intervals for zoomed view
  const { majorInterval, minorInterval } = useMemo(() => {
    const roughMajor = 80 / Math.max(pixelsPerFrame, 0.001);
    const major = niceInterval(roughMajor);
    const minor = major / 5;
    return { majorInterval: major, minorInterval: minor < 1 ? major : minor };
  }, [pixelsPerFrame]);

  // Generate ticks for the zoomed range
  const ticks = useMemo(() => {
    const result: { x: number; frame: number; isMajor: boolean }[] = [];
    if (containerWidth <= 0) return result;

    // Start from first tick aligned to minorInterval within view
    const firstTick = Math.ceil(zoomStart / minorInterval) * minorInterval;
    for (let frame = firstTick; frame <= zoomEnd; frame += minorInterval) {
      const roundedFrame = Math.round(frame);
      const x = ((roundedFrame - zoomStart) / zoomSpan) * containerWidth;
      const isMajor = Math.abs(roundedFrame % majorInterval) < 0.5;
      result.push({ x, frame: roundedFrame, isMajor });
    }
    return result;
  }, [containerWidth, zoomStart, zoomEnd, zoomSpan, majorInterval, minorInterval]);

  // Playhead X in zoomed view
  const playheadInView = generation >= zoomStart && generation <= zoomEnd;
  const playheadX = ((generation - zoomStart) / zoomSpan) * containerWidth;

  // Computed extent bar in zoomed view — shows actual cache frontier, not playhead history
  const computedExtent = Math.max(computedGeneration, maxGeneration);
  const computedEndX = ((Math.min(computedExtent, zoomEnd) - zoomStart) / zoomSpan) * containerWidth;
  const computedStartX = ((Math.max(0, zoomStart) - zoomStart) / zoomSpan) * containerWidth;

  // Seek to pixel position — RAF-coalesced so only one seek per frame
  const seekToX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, containerWidth));
    const targetGen = Math.round(zoomStart + (x / containerWidth) * zoomSpan);
    const clampedGen = Math.max(0, Math.min(targetGen, Math.max(computedGeneration, maxGeneration)));

    pendingSeekRef.current = clampedGen;
    if (seekRafRef.current === null) {
      seekRafRef.current = requestAnimationFrame(() => {
        seekRafRef.current = null;
        if (pendingSeekRef.current !== null) {
          commandRegistry.execute('sim.seek', { generation: pendingSeekRef.current });
          pendingSeekRef.current = null;
        }
      });
    }
  }, [containerWidth, zoomStart, zoomSpan, maxGeneration]);

  // Seek from mini-map click
  const seekToFrame = useCallback((frame: number) => {
    const clampedGen = Math.max(0, Math.min(frame, Math.max(computedGeneration, maxGeneration)));
    commandRegistry.execute('sim.seek', { generation: clampedGen });
  }, [maxGeneration]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isRunning) return;
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekToX(e.clientX);
  }, [isRunning, seekToX]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    seekToX(e.clientX);
  }, [seekToX]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Scroll wheel zoom — centered on cursor position
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorFraction = cursorX / containerWidth;
    const cursorFrame = zoomStart + cursorFraction * zoomSpan;

    // Zoom factor: scroll up = zoom in, scroll down = zoom out
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    const newSpan = Math.max(10, Math.min(duration, zoomSpan * factor));

    // Keep cursor frame at the same screen position
    const newStart = cursorFrame - cursorFraction * newSpan;
    const clampedStart = Math.max(0, Math.min(newStart, duration - newSpan));
    uiStoreActions.setTimelineZoom(clampedStart, clampedStart + newSpan);
  }, [containerWidth, zoomStart, zoomSpan, duration]);

  return (
    <div className="select-none" data-testid="timeline">
      {/* Mini-map — always shows full 0..duration */}
      <MiniMap
        containerWidth={containerWidth}
        duration={duration}
        computedFrames={Math.max(computedGeneration, maxGeneration)}
        generation={generation}
        zoomStart={zoomStart}
        zoomEnd={zoomEnd}
        onSeek={seekToFrame}
      />

      {/* Main ruler — zoomed view, full width */}
      <div
        ref={containerRef}
        className={`relative overflow-hidden ${isRunning ? 'cursor-default' : 'cursor-pointer'}`}
        style={{ height: RULER_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        data-testid="timeline-ruler"
      >
        {/* Computed region background — green tint shows cached frames */}
        {computedExtent > 0 && computedEndX > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-green-500/8 pointer-events-none"
            style={{ left: Math.max(0, computedStartX), width: Math.max(0, computedEndX - Math.max(0, computedStartX)) }}
          />
        )}

        {/* Tick marks and labels */}
        {ticks.map((tick, i) => (
          <div key={i} className="absolute top-0" style={{ left: tick.x }}>
            <div
              className={tick.isMajor ? 'bg-zinc-500' : 'bg-zinc-700'}
              style={{ width: 1, height: tick.isMajor ? MAJOR_TICK_HEIGHT : MINOR_TICK_HEIGHT }}
            />
            {tick.isMajor && (
              <span
                className="absolute text-[9px] font-mono text-zinc-500 whitespace-nowrap"
                style={{ top: MAJOR_TICK_HEIGHT + 1, left: -1, transform: 'translateX(-50%)' }}
              >
                {formatLabel(tick.frame, displayMode, speed)}
              </span>
            )}
          </div>
        ))}

        {/* Playhead */}
        {playheadInView && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: playheadX, transform: 'translateX(-0.5px)' }}
            data-testid="timeline-playhead"
          >
            <div
              className="absolute -top-[1px] left-1/2 -translate-x-1/2"
              style={{
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid #4ade80',
              }}
            />
            <div className="absolute top-[5px] bottom-0 left-0 w-px bg-green-400" />
          </div>
        )}

        {/* Played portion highlight */}
        {playheadInView && playheadX > 0 && (
          <div
            className="absolute bottom-0 left-0 h-[2px] bg-green-400/20 pointer-events-none"
            style={{ width: playheadX }}
          />
        )}
      </div>
    </div>
  );
}
