/**
 * BrushToolbar: horizontal toolbar for brush selection and radius control.
 *
 * M2: Property-aware brush system. Shows available brushes as buttons,
 * a radius slider, blend mode selector, and a summary of the active brush's
 * property actions with the current blend mode applied.
 *
 * Compact single-row layout — Photoshop tool options bar style.
 */

'use client';

import { useCallback } from 'react';
import { useBrushStore, brushStoreActions, type BrushBlendMode } from '@/store/brushStore';
import { commandRegistry } from '@/commands/CommandRegistry';

const BLEND_MODE_LABELS: Record<BrushBlendMode, string> = {
  normal: 'Norm',
  set: 'Set',
  add: 'Add',
  multiply: 'Mul',
  random: 'Rand',
  clear: 'Clr',
};

const BLEND_MODES: BrushBlendMode[] = ['normal', 'set', 'add', 'multiply', 'random', 'clear'];

export function BrushToolbar() {
  const brushes = useBrushStore((s) => s.availableBrushes);
  const activeIdx = useBrushStore((s) => s.activeBrushIndex);
  const radiusOverride = useBrushStore((s) => s.radiusOverride);
  const blendMode = useBrushStore((s) => s.blendMode);

  const activeBrush = brushes[activeIdx];
  const effectiveBrush = brushStoreActions.getEffectiveBrush();
  const effectiveRadius = radiusOverride ?? activeBrush?.radius ?? 3;

  const handleSelect = useCallback((index: number) => {
    commandRegistry.execute('brush.select', { index });
  }, []);

  const handleRadiusChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const r = parseInt(e.target.value, 10);
    commandRegistry.execute('brush.setRadius', { radius: r });
  }, []);

  const handleBlendMode = useCallback((mode: BrushBlendMode) => {
    brushStoreActions.setBlendMode(mode);
  }, []);

  if (!activeBrush || brushes.length === 0) return null;

  // Build property summary from the effective brush (with blend mode applied)
  const propSummary = effectiveBrush
    ? Object.entries(effectiveBrush.properties)
        .map(([name, action]) => {
          const modeLabel =
            action.mode === 'set' ? '' :
            action.mode === 'add' ? '+' :
            action.mode === 'multiply' ? '\u00D7' :
            '~'; // random
          return `${name}: ${modeLabel}${action.value}`;
        })
        .join(' | ')
    : '';

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 border-b border-zinc-700/40 text-[10px] font-mono"
      data-testid="brush-toolbar"
    >
      {/* Brush buttons */}
      {brushes.map((brush, i) => (
        <button
          key={brush.name}
          onClick={() => handleSelect(i)}
          className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
            i === activeIdx
              ? 'bg-green-500/20 border-green-500/50 text-green-300'
              : 'border-zinc-600/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
          }`}
          title={`Select brush: ${brush.name} (${i + 1})`}
          data-testid={`brush-btn-${i}`}
        >
          {brush.name}
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-4 bg-zinc-700/50" />

      {/* Blend mode selector */}
      <div className="flex items-center gap-0.5">
        {BLEND_MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => handleBlendMode(mode)}
            className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              blendMode === mode
                ? mode === 'clear'
                  ? 'bg-red-500/20 border border-red-500/50 text-red-300'
                  : 'bg-green-500/20 border border-green-500/50 text-green-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={`Blend mode: ${mode}`}
            data-testid={`blend-${mode}`}
          >
            {BLEND_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-zinc-700/50" />

      {/* Radius control */}
      <span className="text-zinc-500">R</span>
      <input
        type="range"
        min={1}
        max={50}
        value={effectiveRadius}
        onChange={handleRadiusChange}
        className="w-16 h-1 accent-green-500"
        title={`Brush radius: ${effectiveRadius}`}
        data-testid="brush-radius-slider"
      />
      <span className="text-zinc-400 w-5 text-right tabular-nums">
        {effectiveRadius}
      </span>

      {/* Divider */}
      <div className="w-px h-4 bg-zinc-700/50" />

      {/* Shape indicator */}
      <span className="text-zinc-500" title={`Shape: ${activeBrush.shape}`}>
        {activeBrush.shape === 'circle' ? '\u25CB' : '\u25A1'}
      </span>

      {/* Falloff indicator */}
      <span className="text-zinc-500" title={`Falloff: ${activeBrush.falloff}`}>
        {activeBrush.falloff === 'hard' ? 'H' : activeBrush.falloff === 'linear' ? 'L' : 'S'}
      </span>

      {/* Divider */}
      <div className="w-px h-4 bg-zinc-700/50" />

      {/* Property summary */}
      <span className="text-zinc-500 truncate max-w-[240px]" title={propSummary}>
        {propSummary}
      </span>
    </div>
  );
}
