/**
 * ControlBar: simulation control toolbar.
 *
 * Inline flex row — no absolute positioning. Embedded by BottomTray.
 *
 * Play/Pause toggle, Step Forward, Step Back, Reset, Clear, Speed slider,
 * Timeline scrubber, Split viewport toggle, and Screenshot export.
 *
 * GUIP-04: Shortcut hints shown in button titles.
 * GUIP-05: Screenshot button triggers viewport.screenshot command.
 */

'use client';

import { useCallback } from 'react';
import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';

const SPEED_VALUES = [1, 5, 10, 30, 60, 0]; // 0 = max

function speedToLabel(fps: number): string {
  return fps === 0 ? 'Max' : `${fps} FPS`;
}

function speedToSliderIndex(fps: number): number {
  const idx = SPEED_VALUES.indexOf(fps);
  return idx >= 0 ? idx : 2; // Default to 10 FPS
}

const PLAYBACK_MODE_ICONS: Record<string, string> = {
  loop: '\u27F3',    // ⟳
  endless: '\u221E', // ∞
  once: '\u21E5',    // ⇥ (arrow to bar — play to end then stop)
};

export function ControlBar() {
  const isRunning = useSimStore((s) => s.isRunning);
  const speed = useSimStore((s) => s.speed);
  const viewportCount = useUiStore((s) => s.viewportCount);
  const playbackMode = useUiStore((s) => s.playbackMode);

  const handlePlayPause = useCallback(() => {
    if (isRunning) {
      commandRegistry.execute('sim.pause', {});
    } else {
      commandRegistry.execute('sim.play', {});
    }
  }, [isRunning]);

  const handleStep = useCallback(() => {
    commandRegistry.execute('sim.step', {});
  }, []);

  const handleStepBack = useCallback(() => {
    commandRegistry.execute('sim.stepBack', {});
  }, []);

  const handleReset = useCallback(() => {
    commandRegistry.execute('sim.reset', {});
  }, []);

  const handleClear = useCallback(() => {
    commandRegistry.execute('sim.clear', {});
  }, []);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    const fps = SPEED_VALUES[idx];
    commandRegistry.execute('sim.speed', { fps });
  }, []);

  const handleSplitToggle = useCallback(() => {
    commandRegistry.execute('view.split', {});
  }, []);

  const handleScreenshot = useCallback(() => {
    commandRegistry.execute('viewport.screenshot', {});
  }, []);

  const handlePlaybackMode = useCallback(() => {
    const modes = ['loop', 'endless', 'once'] as const;
    const currentIdx = modes.indexOf(playbackMode as typeof modes[number]);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    commandRegistry.execute('sim.setPlaybackMode', { mode: nextMode });
  }, [playbackMode]);

  return (
    <div
      className="flex items-center gap-2 px-1 py-1.5"
      data-testid="control-bar"
    >
      {/* Step Back */}
      <button
        onClick={handleStepBack}
        className="text-zinc-300 hover:text-white px-2 py-1 text-lg"
        title="Step Back (B)"
        data-testid="btn-step-back"
      >
        {'\u23EE'}
      </button>

      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className={`px-2 py-1 text-lg ${isRunning ? 'text-green-400' : 'text-zinc-300 hover:text-white'}`}
        title={isRunning ? 'Pause (Space)' : 'Play (Space)'}
        data-testid="btn-play-pause"
      >
        {isRunning ? '\u23F8' : '\u25B6'}
      </button>

      {/* Step Forward */}
      <button
        onClick={handleStep}
        className="text-zinc-300 hover:text-white px-2 py-1 text-lg"
        title="Step Forward (N)"
        data-testid="btn-step"
      >
        {'\u23ED'}
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-700" />

      {/* Reset */}
      <button
        onClick={handleReset}
        className="text-zinc-300 hover:text-white px-2 py-1 text-lg"
        title="Reset (R)"
        data-testid="btn-reset"
      >
        {'\u21BA'}
      </button>

      {/* Clear */}
      <button
        onClick={handleClear}
        className="text-zinc-300 hover:text-white px-2 py-1 text-lg"
        title="Clear (C)"
        data-testid="btn-clear"
      >
        {'\u2715'}
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-700" />

      {/* Speed Slider */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max={SPEED_VALUES.length - 1}
          value={speedToSliderIndex(speed)}
          onChange={handleSpeedChange}
          className="w-20 accent-green-500"
          title="Speed"
          data-testid="speed-slider"
        />
        <span className="text-xs font-mono text-zinc-400 w-12 text-right">
          {speedToLabel(speed)}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-700" />

      {/* Playback Mode */}
      <button
        onClick={handlePlaybackMode}
        className="text-zinc-300 hover:text-white w-8 h-8 flex items-center justify-center text-xl leading-none"
        title={`Playback: ${playbackMode}`}
        data-testid="btn-playback-mode"
      >
        {PLAYBACK_MODE_ICONS[playbackMode] || '\u221E'}
      </button>

      {/* Screenshot */}
      <button
        onClick={handleScreenshot}
        className="text-zinc-300 hover:text-white px-2 py-1 text-lg"
        title="Screenshot"
        data-testid="btn-screenshot"
      >
        {'\uD83D\uDCF7'}
      </button>

      {/* Split Viewport Toggle */}
      <button
        onClick={handleSplitToggle}
        className={`px-2 py-1 text-lg ${viewportCount === 2 ? 'text-green-400' : 'text-zinc-300 hover:text-white'}`}
        title={viewportCount === 2 ? 'Single viewport (S)' : 'Split viewport (S)'}
        data-testid="btn-split"
      >
        {'\u2261'}
      </button>
    </div>
  );
}
