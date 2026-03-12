/**
 * Timeline: Premiere-style full-width timeline ruler with playhead.
 *
 * Features:
 * - Full-width ruler with adaptive tick marks and frame/time labels
 * - Thin playhead line with top triangle marker
 * - Click-to-seek and drag-to-scrub with pointer capture
 * - Configurable display: frames, time, or timecode
 */

'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';
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

/** Exported for testing. */
export { niceInterval, formatLabel };

const RULER_HEIGHT = 24;
const MAJOR_TICK_HEIGHT = 10;
const MINOR_TICK_HEIGHT = 5;

export function Timeline() {
  const generation = useSimStore((s) => s.generation);
  const maxGeneration = useSimStore((s) => s.maxGeneration);
  const speed = useSimStore((s) => s.speed);
  const isRunning = useSimStore((s) => s.isRunning);
  const displayMode = useUiStore((s) => s.timelineDisplayMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const draggingRef = useRef(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate tick intervals
  const totalFrames = Math.max(maxGeneration, 1);
  const pixelsPerFrame = containerWidth / totalFrames;

  const { majorInterval, minorInterval } = useMemo(() => {
    const roughMajor = 80 / Math.max(pixelsPerFrame, 0.001);
    const major = niceInterval(roughMajor);
    const minor = major / 5;
    return { majorInterval: major, minorInterval: minor < 1 ? major : minor };
  }, [pixelsPerFrame]);

  // Generate tick positions
  const ticks = useMemo(() => {
    const result: { x: number; frame: number; isMajor: boolean }[] = [];
    if (containerWidth <= 0) return result;

    // Use minor interval for iteration, flag majors
    const step = minorInterval;
    for (let frame = 0; frame <= totalFrames; frame += step) {
      const roundedFrame = Math.round(frame);
      const x = (roundedFrame / totalFrames) * containerWidth;
      const isMajor = Math.abs(roundedFrame % majorInterval) < 0.5;
      result.push({ x, frame: roundedFrame, isMajor });
    }
    return result;
  }, [containerWidth, totalFrames, majorInterval, minorInterval]);

  // Playhead position
  const playheadX = totalFrames > 0 ? (generation / totalFrames) * containerWidth : 0;

  // Seek to a pixel position
  const seekToX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, containerWidth));
    const targetGen = Math.round((x / containerWidth) * totalFrames);

    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      commandRegistry.execute('sim.seek', { generation: targetGen });
    }, 16);
  }, [containerWidth, totalFrames]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isRunning) return; // Don't scrub while running
    e.preventDefault();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekToX(e.clientX);
  }, [isRunning, seekToX]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    seekToX(e.clientX);
  }, [seekToX]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Cycle display mode on click of the time label
  const cycleDisplayMode = useCallback(() => {
    const modes: TimelineDisplayMode[] = ['frames', 'time', 'timecode'];
    const currentIdx = modes.indexOf(displayMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    useUiStore.setState({ timelineDisplayMode: nextMode });
  }, [displayMode]);

  const currentLabel = formatLabel(generation, displayMode, speed);
  const totalLabel = formatLabel(maxGeneration, displayMode, speed);

  return (
    <div className="flex items-center gap-0 select-none" data-testid="timeline">
      {/* Time display — clickable to cycle mode */}
      <button
        onClick={cycleDisplayMode}
        className="shrink-0 px-2 py-0.5 text-[10px] font-mono tabular-nums text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap"
        title={`Display: ${displayMode} (click to cycle)`}
        data-testid="timeline-display-mode"
      >
        {currentLabel} / {totalLabel}
      </button>

      {/* Ruler area */}
      <div
        ref={containerRef}
        className={`relative flex-1 ${isRunning ? 'cursor-default' : 'cursor-pointer'}`}
        style={{ height: RULER_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="timeline-ruler"
      >
        {/* Tick marks and labels */}
        {ticks.map((tick, i) => (
          <div key={i} className="absolute top-0" style={{ left: tick.x }}>
            {/* Tick line */}
            <div
              className={tick.isMajor ? 'bg-zinc-500' : 'bg-zinc-700'}
              style={{
                width: 1,
                height: tick.isMajor ? MAJOR_TICK_HEIGHT : MINOR_TICK_HEIGHT,
              }}
            />
            {/* Label for major ticks */}
            {tick.isMajor && (
              <span
                className="absolute text-[9px] font-mono text-zinc-500 whitespace-nowrap"
                style={{
                  top: MAJOR_TICK_HEIGHT + 1,
                  left: -1,
                  transform: 'translateX(-50%)',
                }}
              >
                {formatLabel(tick.frame, displayMode, speed)}
              </span>
            )}
          </div>
        ))}

        {/* Playhead */}
        {maxGeneration > 0 && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: playheadX, transform: 'translateX(-0.5px)' }}
            data-testid="timeline-playhead"
          >
            {/* Triangle at top */}
            <div
              className="absolute -top-[1px] left-1/2 -translate-x-1/2"
              style={{
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid #4ade80',
              }}
            />
            {/* Vertical line */}
            <div className="absolute top-[5px] bottom-0 left-0 w-px bg-green-400" />
          </div>
        )}

        {/* Filled region (played portion) */}
        {maxGeneration > 0 && (
          <div
            className="absolute bottom-0 left-0 h-[2px] bg-green-400/20 pointer-events-none"
            style={{ width: playheadX }}
          />
        )}
      </div>
    </div>
  );
}
