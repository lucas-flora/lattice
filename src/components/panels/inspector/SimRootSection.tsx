/**
 * Inspector section for sim-root nodes.
 * Interactive grid config, preset selector, speed/status display.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { BUILTIN_PRESET_NAMES_CLIENT as BUILTIN_PRESET_NAMES } from '@/engine/preset/builtinPresetsClient';

const PRESET_DISPLAY_NAMES: Record<string, string> = {
  'conways-gol': "Conway's GoL",
  'rule-110': 'Rule 110',
  'langtons-ant': "Langton's Ant",
  'brians-brain': "Brian's Brain",
  'gray-scott': 'Gray-Scott',
  'navier-stokes': 'Navier-Stokes',
  'link-testbed': 'Link Testbed',
};

interface SimRootSectionProps {
  node: SceneNode;
}

export const SimRootSection: React.FC<SimRootSectionProps> = ({ node }) => {
  const activePreset = useSimStore((s) => s.activePreset);
  const originalName = useSimStore((s) => s.originalPresetName);
  const presetModified = useSimStore((s) => s.presetModified);
  const gridWidth = useSimStore((s) => s.gridWidth);
  const gridHeight = useSimStore((s) => s.gridHeight);
  const speed = useSimStore((s) => s.speed);
  const isRunning = useSimStore((s) => s.isRunning);

  const [editWidth, setEditWidth] = useState(String(gridWidth));
  const [editHeight, setEditHeight] = useState(String(gridHeight));

  useEffect(() => { setEditWidth(String(gridWidth)); }, [gridWidth]);
  useEffect(() => { setEditHeight(String(gridHeight)); }, [gridHeight]);

  const handleGridResize = useCallback(() => {
    const w = parseInt(editWidth, 10);
    const h = parseInt(editHeight, 10);
    if (w > 0 && h > 0) {
      commandRegistry.execute('grid.resize', { width: w, height: h });
    }
  }, [editWidth, editHeight]);

  const props = node.properties;

  return (
    <div className="space-y-3">
      {/* Preset Selector */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-zinc-400 text-[10px] uppercase tracking-wide">Preset</span>
          {presetModified && (
            <>
              <span className="text-amber-400 text-[9px]" title="Preset has been modified">&bull;</span>
              <button
                onClick={() => {
                  if (originalName) {
                    const key = Object.entries(PRESET_DISPLAY_NAMES).find(([, v]) => originalName.includes(v))?.[0];
                    if (key) commandRegistry.execute('preset.load', { name: key });
                  }
                }}
                className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 cursor-pointer"
                title={`Reload ${originalName}`}
              >
                reload
              </button>
            </>
          )}
        </div>
        <select
          value={Object.entries(PRESET_DISPLAY_NAMES).find(
            ([, displayName]) => activePreset?.includes(displayName)
          )?.[0] ?? ''}
          onChange={(e) => {
            if (e.target.value) {
              commandRegistry.execute('preset.load', { name: e.target.value });
            }
          }}
          className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1.5 border border-zinc-700 outline-none cursor-pointer hover:bg-zinc-700 transition-colors"
          data-testid="inspector-preset-dropdown"
        >
          <option value="" disabled>Select preset...</option>
          {BUILTIN_PRESET_NAMES.map((name) => (
            <option key={name} value={name}>
              {PRESET_DISPLAY_NAMES[name] || name}
            </option>
          ))}
        </select>
      </div>

      {/* Grid Controls */}
      <div>
        <div className="text-zinc-400 text-[10px] uppercase tracking-wide mb-1">Grid</div>
        <div className="space-y-1.5 text-xs font-mono text-zinc-400">
          <div className="flex items-center justify-between">
            <span>Width</span>
            <div className="flex items-center gap-0">
              <button
                onClick={() => { const v = Math.max(1, parseInt(editWidth, 10) - 1); setEditWidth(String(v)); commandRegistry.execute('grid.resize', { width: v, height: parseInt(editHeight, 10) }); }}
                className="bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 border-r-0 rounded-l px-1.5 py-0.5 text-xs"
              >{'\u2212'}</button>
              <input
                type="number"
                value={editWidth}
                onChange={(e) => setEditWidth(e.target.value)}
                onBlur={handleGridResize}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGridResize(); }}
                min={1}
                className="w-14 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums px-1 py-0.5 border-y border-zinc-700 outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="inspector-grid-width"
              />
              <button
                onClick={() => { const v = parseInt(editWidth, 10) + 1; setEditWidth(String(v)); commandRegistry.execute('grid.resize', { width: v, height: parseInt(editHeight, 10) }); }}
                className="bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 border-l-0 rounded-r px-1.5 py-0.5 text-xs"
              >+</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span>Height</span>
            <div className="flex items-center gap-0">
              <button
                onClick={() => { const v = Math.max(1, parseInt(editHeight, 10) - 1); setEditHeight(String(v)); commandRegistry.execute('grid.resize', { width: parseInt(editWidth, 10), height: v }); }}
                className="bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 border-r-0 rounded-l px-1.5 py-0.5 text-xs"
              >{'\u2212'}</button>
              <input
                type="number"
                value={editHeight}
                onChange={(e) => setEditHeight(e.target.value)}
                onBlur={handleGridResize}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGridResize(); }}
                min={1}
                className="w-14 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums px-1 py-0.5 border-y border-zinc-700 outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="inspector-grid-height"
              />
              <button
                onClick={() => { const v = parseInt(editHeight, 10) + 1; setEditHeight(String(v)); commandRegistry.execute('grid.resize', { width: parseInt(editWidth, 10), height: v }); }}
                className="bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 border-l-0 rounded-r px-1.5 py-0.5 text-xs"
              >+</button>
            </div>
          </div>
          {/* Read-only topology/dimensionality */}
          <div className="flex justify-between">
            <span>Dimensionality</span>
            <span className="text-zinc-200">{props.dimensionality as string}</span>
          </div>
          <div className="flex justify-between">
            <span>Topology</span>
            <span className="text-zinc-200">{props.topology as string}</span>
          </div>
          <div className="flex justify-between">
            <span>Speed</span>
            <span className="text-zinc-200">{speed === 0 ? 'Max' : `${speed} FPS`}</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span className={isRunning ? 'text-green-400' : 'text-zinc-200'}>
              {isRunning ? 'Running' : 'Paused'}
            </span>
          </div>
        </div>
      </div>

      {/* Capture State */}
      <div>
        <button
          onClick={() => {
            commandRegistry.execute('state.capture', { parentId: node.id });
          }}
          className="w-full text-xs font-mono px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors"
          data-testid="inspector-capture-state"
        >
          Capture State
        </button>
      </div>
    </div>
  );
};
