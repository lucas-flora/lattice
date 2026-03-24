/**
 * VisualSection: Inspector panel section for the Visual (color mapping) node.
 *
 * Shows a color ramp preview, stop list with editable colors/positions,
 * property dropdown, and range inputs.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { GradientBar, type GradientStop } from '../../ui/GradientBar';
import { commandRegistry } from '../../../commands/CommandRegistry';

interface VisualMapping {
  property?: string;
  channel?: string;
  type?: string;
  range?: [number, number];
  stops?: Array<{ t: number; color?: string; alpha?: number }>;
  code?: string;
}

interface VisualSectionProps {
  node: SceneNode;
}

export const VisualSection: React.FC<VisualSectionProps> = ({ node }) => {
  const mappings = (node.properties.mappings ?? []) as VisualMapping[];
  const scriptMapping = mappings.find(m => m.type === 'script' && m.code);
  const rampMapping = mappings.find(m => m.channel === 'color' && m.stops && m.stops.length > 0);
  const [editingStop, setEditingStop] = useState<number | null>(null);

  // Script-type visual mapping
  if (scriptMapping) {
    return (
      <div className="space-y-2">
        <div className="text-zinc-400 text-[9px] uppercase tracking-wide font-mono">
          Color Mapping
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="text-zinc-500">type</span>
          <span className="text-green-400">script</span>
        </div>
        <textarea
          className="w-full text-[10px] font-mono text-zinc-300 bg-zinc-900 rounded p-2 max-h-48 resize-y border border-zinc-800 focus:outline-none focus:border-green-500/50"
          defaultValue={scriptMapping.code}
          spellCheck={false}
          rows={Math.min(10, (scriptMapping.code?.split('\n').length ?? 1) + 1)}
        />
        <div className="text-[9px] text-zinc-600 font-mono">
          script &middot; GPU compute pass
        </div>
      </div>
    );
  }

  // Ramp-type visual mapping
  if (!rampMapping || !rampMapping.stops || rampMapping.stops.length === 0) {
    return (
      <div className="space-y-1">
        <div className="text-zinc-400 text-[9px] uppercase tracking-wide font-mono">
          Color Mapping
        </div>
        <div className="text-zinc-500 text-[11px] font-mono">
          No mapping configured
        </div>
      </div>
    );
  }

  const stops = rampMapping.stops;
  const range = rampMapping.range ?? [0, 1];
  const gradientStops: GradientStop[] = stops
    .filter(s => s.color)
    .map(s => ({ t: s.t, color: s.color! }));

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="text-zinc-400 text-[9px] uppercase tracking-wide font-mono">
        Color Mapping
      </div>

      {/* Property + range */}
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="text-zinc-500">property</span>
        <span className="text-green-400">{rampMapping.property}</span>
        <span className="text-zinc-600 ml-auto">
          [{range[0]}, {range[1]}]
        </span>
      </div>

      {/* Gradient preview */}
      <GradientBar stops={gradientStops} height={24} />

      {/* Stop list */}
      <div className="space-y-0">
        {stops.map((stop, i) => (
          <StopRow
            key={i}
            index={i}
            stop={stop}
            isEditing={editingStop === i}
            onEdit={() => setEditingStop(editingStop === i ? null : i)}
            nodeId={node.id}
          />
        ))}
      </div>

      {/* Stop count */}
      <div className="text-[9px] text-zinc-600 font-mono">
        {stops.length} stops &middot; {rampMapping.type ?? 'ramp'}
      </div>
    </div>
  );
};

// ── Stop row ──

interface StopRowProps {
  index: number;
  stop: { t: number; color?: string; alpha?: number };
  isEditing: boolean;
  onEdit: () => void;
  nodeId: string;
}

const StopRow: React.FC<StopRowProps> = ({ index, stop, isEditing, onEdit, nodeId }) => {
  const [colorValue, setColorValue] = useState(stop.color ?? '#000000');
  const [posValue, setPosValue] = useState(String(stop.t));
  const editRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        onEdit(); // toggle off
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isEditing, onEdit]);

  const handleColorCommit = useCallback(() => {
    commandRegistry.execute('visual.updateStop', {
      nodeId,
      index,
      color: colorValue,
    });
  }, [nodeId, index, colorValue]);

  const handlePosCommit = useCallback(() => {
    const t = parseFloat(posValue);
    if (!isNaN(t) && t >= 0 && t <= 1) {
      commandRegistry.execute('visual.updateStop', {
        nodeId,
        index,
        t,
      });
    }
  }, [nodeId, index, posValue]);

  return (
    <div ref={editRef} className="group relative flex items-center gap-1.5 py-0.5 text-[11px] font-mono">
      {/* Color swatch */}
      <button
        onClick={onEdit}
        className="w-4 h-4 rounded-sm border border-zinc-700 shrink-0 cursor-pointer"
        style={{ backgroundColor: stop.color ?? '#000' }}
        title={`Stop ${index}: ${stop.color}`}
      />

      {/* Position */}
      <span className="text-zinc-500 w-8 text-right tabular-nums">
        {stop.t.toFixed(2)}
      </span>

      {/* Hex color */}
      <span className="text-zinc-400 flex-1">{stop.color}</span>

      {/* Delete button (hover) */}
      <button
        onClick={() => commandRegistry.execute('visual.removeStop', { nodeId, index })}
        className="text-red-400/0 group-hover:text-red-400/60 hover:!text-red-400 text-[9px] cursor-pointer"
        title="Remove stop"
      >
        &times;
      </button>

      {/* Inline edit (if expanded) */}
      {isEditing && (
        <div className="absolute left-0 right-0 mt-6 bg-zinc-800 border border-zinc-700 rounded p-1.5 z-10 space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 text-[9px] w-6">hex</span>
            <input
              type="text"
              value={colorValue}
              onChange={e => setColorValue(e.target.value)}
              onBlur={handleColorCommit}
              onKeyDown={e => e.key === 'Enter' && handleColorCommit()}
              className="flex-1 bg-zinc-900 text-zinc-200 text-[11px] font-mono px-1 py-0.5 rounded border border-zinc-700 focus:ring-1 focus:ring-green-500/50 outline-none"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 text-[9px] w-6">pos</span>
            <input
              type="text"
              value={posValue}
              onChange={e => setPosValue(e.target.value)}
              onBlur={handlePosCommit}
              onKeyDown={e => e.key === 'Enter' && handlePosCommit()}
              className="flex-1 bg-zinc-900 text-zinc-200 text-[11px] font-mono px-1 py-0.5 rounded border border-zinc-700 focus:ring-1 focus:ring-green-500/50 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
